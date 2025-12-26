import { v4 as uuidv4 } from 'uuid';
import { ChatSession, IChatSessionDocument } from '../models/ChatSession.js';
import { ChatDocument, ChatMessage, SBAApplicationData } from '../types/index.js';
import websocketService from './websocket.js';
import {
  CHECKBOX_GROUPS,
  CHECKBOX_GROUPS_413,
  extractFormFieldValues,
  getGroupCheckboxes,
  getGroupCheckboxes413
} from './pdfFormProcessor.js';
import { Application } from '../models/Application.js';
import {
  calculateSBAEligibilityForBuyer,
  calculateSBAEligibilityForOwner,
  createDraft,
  generateDraftPDFs
} from './applicationService.js';
import { downloadDocument, generatePresignedUrl } from './s3Service.js';
import formStateService from './FormStateService.js';
import { getFieldLabel } from './formFields.js';

/**
 * Create a new chat session
 */
export const createSession = async (): Promise<IChatSessionDocument> => {
  const sessionId = uuidv4();
  const session = new ChatSession({
    sessionId,
    messages: [],
    userData: {}
  });
  await session.save();
  return session;
};

/**
 * Get a chat session by ID
 */
export const getSession = async (sessionId: string): Promise<IChatSessionDocument | null> => {
  return await ChatSession.findOne({ sessionId });
};

/**
 * Add a message to a chat session
 */
export const addMessage = async (
  sessionId: string,
  message: ChatMessage
): Promise<IChatSessionDocument | null> => {
  return await ChatSession.findOneAndUpdate(
    { sessionId },
    { $push: { messages: message } },
    { new: true }
  );
};

/**
 * Update user data in a chat session
 */
export const updateUserData = async (
  sessionId: string,
  data: Record<string, any>
): Promise<IChatSessionDocument | null> => {
  // Get current session
  const session = await ChatSession.findOne({ sessionId });
  if (!session) return null;

  // Merge new data with existing userData
  const updatedUserData = {
    ...session.userData,
    ...data,
    updatedAt: new Date()
  };

  return await ChatSession.findOneAndUpdate(
    { sessionId },
    { $set: { userData: updatedUserData } },
    { new: true }
  );
};

/**
 * Link an application to a chat session
 */
export const linkApplication = async (
  sessionId: string,
  applicationId: string
): Promise<IChatSessionDocument | null> => {
  return await ChatSession.findOneAndUpdate(
    { sessionId },
    { $set: { applicationId } },
    { new: true }
  );
};

/**
 * Delete a chat session
 */
export const deleteSession = async (sessionId: string): Promise<boolean> => {
  const result = await ChatSession.deleteOne({ sessionId });
  return result.deletedCount > 0;
};

// ==============================
// TOOL HANDLERS
// ==============================

interface ToolResult {
  success: boolean;
  message: string;
  instruction?: string;  // Guides LLM on how to respond in second pass
  data?: any;
}

/**
 * Get WebSocket rooms for a session
 */
const getRooms = (sessionId: string): string[] => ['global', sessionId];

/**
 * Generate flow context string for LLM injection
 * This reminds the LLM which conversation flow it's in to prevent random flow switches
 */
export const getFlowContext = (userData: Record<string, any> | undefined): string => {
  const flow = userData?.currentFlow;
  if (!flow) return '';

  const flowDescriptions: Record<string, string> = {
    'new_application': 'NEW APPLICATION - Collecting eligibility data, then filling SBA forms',
    'continue_application': 'CONTINUE APPLICATION - Filling out SBA form fields for an existing application',
    'check_status': 'CHECK STATUS - Answering questions about application status'
  };

  return `[CURRENT FLOW: ${flowDescriptions[flow] || flow}]
⚠️ STAY IN THIS FLOW. Do NOT switch to asking new application questions.
Do NOT call detectConversationFlow again unless user explicitly requests a different action.`;
};

/**
 * Build applicantData from session userData for PDF generation
 */
const buildApplicantDataFromSession = (userData: Record<string, any>): Partial<SBAApplicationData> => {
  const applicantData: Partial<SBAApplicationData> = {
    name: userData.name,
    businessName: userData.businessName,
    businessPhoneNumber: userData.businessPhone,
    creditScore: userData.creditScore,
    yearFounded: userData.yearFounded,
    isUSCitizen: userData.usCitizen,
    userType: userData.userType || 'owner',
  };

  // Add buyer-specific fields
  if (userData.purchasePrice) applicantData.purchasePrice = String(userData.purchasePrice);
  if (userData.availableCash) applicantData.availableCash = String(userData.availableCash);
  if (userData.businessCashFlow) applicantData.businessCashFlow = String(userData.businessCashFlow);
  if (userData.industryExperience) applicantData.industryExperience = userData.industryExperience;

  // Add owner-specific fields
  if (userData.monthlyRevenue) applicantData.monthlyRevenue = String(userData.monthlyRevenue);
  if (userData.monthlyExpenses) applicantData.monthlyExpenses = String(userData.monthlyExpenses);
  if (userData.existingDebtPayment) applicantData.existingDebtPayment = String(userData.existingDebtPayment);
  if (userData.requestedLoanAmount) applicantData.requestedLoanAmount = String(userData.requestedLoanAmount);
  if (userData.loanPurpose) applicantData.loanPurpose = userData.loanPurpose;

  // Add checkbox fields (prefixed with checkbox_)
  for (const [key, value] of Object.entries(userData)) {
    if (key.startsWith('checkbox_') && typeof value === 'string') {
      (applicantData as any)[key] = value;
    }
  }

  return applicantData;
};

/**
 * Update draft PDFs in S3 with current session data
 * Called when form is complete or on inactivity timeout
 */
export const updateDraftPDFsInBackground = async (
  sessionId: string,
  applicationId: string
): Promise<void> => {
  try {
    const session = await getSession(sessionId);
    if (!session?.userData) {
      console.log(`⚠️ No userData found for session ${sessionId}, skipping PDF update`);
      return;
    }

    // Build applicantData from session userData
    const applicantData = buildApplicantDataFromSession(session.userData);

    // Regenerate and upload PDFs (overwrites existing in S3)
    await generateDraftPDFs(applicantData, applicationId);

    // Update application record with latest draft documents
    await Application.findByIdAndUpdate(applicationId, {
      updatedAt: new Date()
    });

    console.log(`✅ Draft PDFs updated for application ${applicationId}`);
  } catch (error) {
    console.error(`❌ Failed to update draft PDFs for application ${applicationId}:`, error);
  }
};

/**
 * Handle captureUserName tool
 */
export const handleCaptureUserName = async (
  sessionId: string,
  args: { name?: string }
): Promise<ToolResult> => {
  const { name } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { name });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { userName: name },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: `Name "${name ?? ''}" captured.`,
    instruction: "Acknowledge the name and ask about their business name"
  };
};

/**
 * Handle captureBusinessName tool
 */
export const handleCaptureBusinessName = async (
  sessionId: string,
  args: { businessName?: string }
): Promise<ToolResult> => {
  const { businessName } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { businessName });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { businessName },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: `Business name "${businessName ?? ''}" captured.`,
    instruction: "Acknowledge and ask for the business phone number"
  };
};

/**
 * Handle captureBusinessPhone tool
 */
export const handleCaptureBusinessPhone = async (
  sessionId: string,
  args: { businessPhone?: string }
): Promise<ToolResult> => {
  const { businessPhone } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { businessPhone });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { businessPhone },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Business phone captured.',
    instruction: "Acknowledge the phone number"
  };
};

/**
 * Handle captureCreditScore tool
 */
export const handleCaptureCreditScore = async (
  sessionId: string,
  args: { creditScore?: number }
): Promise<ToolResult> => {
  const { creditScore } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { creditScore });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { creditScore },
    source: 'chat'
  }, rooms);

  // HARD STOP: Credit score below 650
  if (creditScore && creditScore < 650) {
    const chanceResult = {
      score: 0,
      chance: 'low' as const,
      reasons: [
        'Credit score below 650 minimum requirement for SBA financing',
        'Improve personal credit profile before reapplying'
      ]
    };

    websocketService.broadcast('calculate-chances', {
      timestamp: new Date().toISOString(),
      source: 'calculate-chances',
      result: chanceResult,
      rejected: true
    }, rooms);

    return {
      success: true,
      message: 'Ineligible for SBA loan',
      instruction: `STOP the application flow. Inform the user: 'Unfortunately, SBA loans typically require a minimum credit score of 650. Your current score of ${creditScore} is below this threshold. We recommend working on improving your credit before reapplying.'`,
      data: { rejected: true, ...chanceResult }
    };
  }

  return {
    success: true,
    message: 'Credit score captured.',
    instruction: "Acknowledge and ask how much they're looking to borrow"
  };
};

/**
 * Handle captureYearFounded tool
 */
export const handleCaptureYearFounded = async (
  sessionId: string,
  args: { yearFounded?: number }
): Promise<ToolResult> => {
  const { yearFounded } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { yearFounded });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { yearFounded },
    source: 'chat'
  }, rooms);

  // HARD STOP: Business less than 2 years old
  const currentYear = new Date().getFullYear();
  const businessAge = currentYear - (yearFounded || currentYear);
  if (yearFounded && businessAge < 2) {
    const chanceResult = {
      score: 0,
      chance: 'low' as const,
      reasons: [
        'Business has operated for less than 2 years',
        'Reapply once the business reaches 24 months of operating history'
      ]
    };

    websocketService.broadcast('calculate-chances', {
      timestamp: new Date().toISOString(),
      source: 'calculate-chances',
      result: chanceResult,
      rejected: true
    }, rooms);

    return {
      success: true,
      message: 'Ineligible for SBA loan',
      instruction: `STOP the application flow. Inform the user: 'Unfortunately, SBA loans require the business to have at least 2 years of operating history. The business was founded in ${yearFounded}, which is only ${businessAge} year(s) ago. Please reapply once the business reaches 24 months of operation.'`,
      data: { rejected: true, ...chanceResult }
    };
  }

  return {
    success: true,
    message: 'Year founded captured.',
    instruction: "Acknowledge and ask about their monthly revenue"
  };
};

/**
 * Handle captureUSCitizen tool
 */
export const handleCaptureUSCitizen = async (
  sessionId: string,
  args: { usCitizen?: boolean | string }
): Promise<ToolResult> => {
  const { usCitizen } = args;
  const rooms = getRooms(sessionId);
  console.log(`🛂 Captured US citizenship status: ${usCitizen}`);
  await updateUserData(sessionId, { usCitizen });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { usCitizen },
    source: 'chat'
  }, rooms);

  // HARD STOP: Non-US citizens are ineligible for SBA loans
  if (usCitizen === false || usCitizen === 'false' || usCitizen === 'no') {
    const chanceResult = {
      score: 0,
      chance: 'low' as const,
      reasons: [
        'Non-US citizens are ineligible for SBA loans',
        'Consider alternative financing options such as conventional business loans or seller financing'
      ]
    };

    websocketService.broadcast('calculate-chances', {
      timestamp: new Date().toISOString(),
      source: 'calculate-chances',
      result: chanceResult,
      rejected: true
    }, rooms);

    return {
      success: true,
      message: 'Ineligible for SBA loan',
      instruction: "STOP the application flow. Inform the user: 'Unfortunately, SBA loans require US citizenship or lawful permanent resident status. You may want to explore alternative financing options such as conventional business loans or seller financing.'",
      data: { rejected: true, ...chanceResult }
    };
  }

  return {
    success: true,
    message: 'US citizenship status captured.',
    instruction: "Acknowledge and ask about their credit score"
  };
};

/**
 * Handle captureAnnualRevenue tool
 */
export const handleCaptureAnnualRevenue = async (
  sessionId: string,
  args: { annualRevenue?: number }
): Promise<ToolResult> => {
  const { annualRevenue } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { annualRevenue });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { annualRevenue },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Annual revenue captured.',
    instruction: "Acknowledge the annual revenue"
  };
};

/**
 * Handle captureMonthlyRevenue tool
 */
export const handleCaptureMonthlyRevenue = async (
  sessionId: string,
  args: { monthlyRevenue?: number }
): Promise<ToolResult> => {
  const { monthlyRevenue } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { monthlyRevenue });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { monthlyRevenue },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Monthly revenue captured.',
    instruction: "Acknowledge and ask about their monthly expenses"
  };
};

/**
 * Handle captureMonthlyExpenses tool
 */
export const handleCaptureMonthlyExpenses = async (
  sessionId: string,
  args: { monthlyExpenses?: number }
): Promise<ToolResult> => {
  const { monthlyExpenses } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { monthlyExpenses });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { monthlyExpenses },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Monthly expenses captured.',
    instruction: "Acknowledge and ask if they have existing debt payments"
  };
};

/**
 * Handle captureExistingDebtPayment tool
 */
export const handleCaptureExistingDebtPayment = async (
  sessionId: string,
  args: { existingDebtPayment?: number }
): Promise<ToolResult> => {
  const { existingDebtPayment } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { existingDebtPayment });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { existingDebtPayment },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Existing debt payment captured.',
    instruction: "Acknowledge and ask how much they want to borrow"
  };
};

/**
 * Handle captureRequestedLoanAmount tool
 */
export const handleCaptureRequestedLoanAmount = async (
  sessionId: string,
  args: { requestedLoanAmount?: number }
): Promise<ToolResult> => {
  const { requestedLoanAmount } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { requestedLoanAmount });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { requestedLoanAmount },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Requested loan amount captured.',
    instruction: "Acknowledge and ask if they are a U.S. citizen"
  };
};

/**
 * Handle captureLoanPurpose tool
 */
export const handleCaptureLoanPurpose = async (
  sessionId: string,
  args: { loanPurpose?: string | string[] }
): Promise<ToolResult> => {
  const { loanPurpose } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { loanPurpose });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { loanPurpose },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Loan purpose captured.',
    instruction: "Acknowledge the loan purpose"
  };
};

/**
 * Handle capturePurchasePrice tool
 */
export const handleCapturePurchasePrice = async (
  sessionId: string,
  args: { purchasePrice?: number }
): Promise<ToolResult> => {
  const { purchasePrice } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { purchasePrice });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { purchasePrice },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Purchase price captured.',
    instruction: "Acknowledge and ask about the business cash flow"
  };
};

/**
 * Handle captureAvailableCash tool
 */
export const handleCaptureAvailableCash = async (
  sessionId: string,
  args: { availableCash?: number }
): Promise<ToolResult> => {
  const { availableCash } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { availableCash });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { availableCash },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Available cash captured.',
    instruction: "Acknowledge and ask about their industry experience"
  };
};

/**
 * Handle captureBusinessCashFlow tool
 */
export const handleCaptureBusinessCashFlow = async (
  sessionId: string,
  args: { businessCashFlow?: number }
): Promise<ToolResult> => {
  const { businessCashFlow } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { businessCashFlow });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { businessCashFlow },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Business cash flow captured.',
    instruction: "Acknowledge and ask how much cash they have available for the purchase"
  };
};

/**
 * Handle captureIndustryExperience tool
 */
export const handleCaptureIndustryExperience = async (
  sessionId: string,
  args: { industryExperience?: string }
): Promise<ToolResult> => {
  const { industryExperience } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { industryExperience });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { industryExperience },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Industry experience captured.',
    instruction: "Acknowledge and tell them you'll calculate their chances"
  };
};

/**
 * Handle captureUserTypeNewApplication tool
 */
export const handleCaptureUserTypeNewApplication = async (
  sessionId: string,
  args: { type?: string }
): Promise<ToolResult> => {
  const { type } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { type });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { type },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'User type captured.',
    instruction: "Acknowledge and ask when the business was founded"
  };
};

/**
 * Handle captureSellingFinancingPercentage tool
 */
export const handleCaptureSellingFinancingPercentage = async (
  sessionId: string,
  args: { sellerFinancingPercentage?: number }
): Promise<ToolResult> => {
  const { sellerFinancingPercentage } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { sellerFinancingPercentage });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { sellerFinancingPercentage },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Seller financing percentage captured.',
    instruction: "Acknowledge the seller financing percentage"
  };
};

/**
 * Handle captureIfSellerFinancingOnStandbyExists tool
 */
export const handleCaptureIfSellerFinancingOnStandbyExists = async (
  sessionId: string,
  args: { sellerFinancingOnStandbyExists?: boolean }
): Promise<ToolResult> => {
  const { sellerFinancingOnStandbyExists } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { sellerFinancingOnStandbyExists });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { sellerFinancingOnStandbyExists },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Seller financing on standby status captured.',
    instruction: "Acknowledge the seller financing standby status"
  };
};

/**
 * Handle captureOpenSBAForm tool
 */
export const handleCaptureOpenSBAForm = async (
  sessionId: string,
  args: { formType?: string }
): Promise<ToolResult> => {
  const { formType } = args;
  const rooms = getRooms(sessionId);
  await updateUserData(sessionId, { formType });

  const activeFormType = (formType as 'SBA_1919' | 'SBA_413') || 'SBA_1919';

  // Set current form in FormStateService and get next field
  formStateService.setCurrentForm(sessionId, activeFormType);
  const nextField = formStateService.getNextField(sessionId, activeFormType);

  // Broadcast form open event
  websocketService.broadcast('open-sba-form', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { formType },
    nextField: nextField || null,
    source: 'chat'
  }, rooms);

  // Auto-highlight first empty field if available
  // Add a small delay to ensure the form is rendered before highlighting
  if (nextField) {
    // Delay highlighting by 3 seconds to allow form to render
    setTimeout(() => {
      websocketService.broadcast('highlight-fields', {
        sessionId,
        timestamp: new Date().toISOString(),
        field: nextField,
        text: '',  // Empty text, just highlighting
        formType: activeFormType,
        source: 'chat'
      }, rooms);
    }, 3000);

    const fieldLabel = getFieldLabel(activeFormType, nextField);
    return {
      success: true,
      message: `Form ${formType} opened. Starting with field: "${nextField}" (${fieldLabel}).`,
      instruction: `Tell them you're opening ${formType} and starting with the first field: "${fieldLabel}". Ask about that field.`
    };
  }

  return {
    success: true,
    message: `Form ${formType} opened.`,
    instruction: "Tell them you're opening the form and will guide them through it"
  };
};

/**
 * Handle captureHighlightField tool
 * Now integrates with FormStateService for automatic next field tracking
 */
export const handleCaptureHighlightField = async (
  sessionId: string,
  args: { field?: string; text?: string; formType?: 'SBA_1919' | 'SBA_413' },
  applicationId?: string
): Promise<ToolResult> => {
  const { field, text, formType } = args;
  const rooms = getRooms(sessionId);

  if (!field) {
    return {
      success: false,
      message: 'Field name is required'
    };
  }

  const activeFormType = formType || 'SBA_1919';
  const formLabel = activeFormType === 'SBA_413' ? '[Form 413]' : '[Form 1919]';

  // If text is provided and we have an applicationId, update the form state
  let nextField: string | null = null;
  let isSubmittable = false;

  if (text && applicationId && formStateService.hasSession(applicationId)) {
    const result = formStateService.updateField(applicationId, activeFormType, field, text);
    nextField = result.nextField;
    isSubmittable = result.isSubmittable;
  }

  websocketService.broadcast('highlight-fields', {
    sessionId,
    timestamp: new Date().toISOString(),
    field,
    text,
    formType: activeFormType,
    source: 'chat'
  }, rooms);

  // Build instruction based on whether there's a next field
  let instruction: string;
  if (text) {
    if (nextField) {
      instruction = `Acknowledge the value was captured. The next field is "${nextField}" (${getFieldLabel(activeFormType, nextField)}). Ask about it.`;
    } else if (isSubmittable) {
      instruction = `Acknowledge the value was captured. All required fields are complete! Ask if they want to review the form or continue to the next form.`;
    } else {
      instruction = `Acknowledge the value was captured. Form is complete but may be missing some optional fields.`;
    }
  } else {
    instruction = `Ask the user for this field's value`;
  }

  return {
    success: true,
    message: `${formLabel} Field "${field}" ${text ? 'filled with value and ' : ''}highlighted.`,
    instruction,
    data: {
      field,
      text,
      formType: activeFormType,
      filled: !!text,
      nextField,
      isSubmittable
    }
  };
};

/**
 * Handle captureUnifiedField tool
 * Captures a value and saves it to corresponding fields in BOTH SBA forms (1919 and 413)
 * Used for shared data like name, business name, phone, address, SSN
 */
export const handleCaptureUnifiedField = async (
  sessionId: string,
  args: { unifiedFieldName?: string; value?: string },
  applicationId?: string
): Promise<ToolResult> => {
  const { unifiedFieldName, value } = args;

  if (!unifiedFieldName) {
    return {
      success: false,
      message: 'unifiedFieldName is required'
    };
  }

  if (!value) {
    return {
      success: false,
      message: 'value is required'
    };
  }

  if (!applicationId) {
    return {
      success: false,
      message: 'No active application. Cannot save unified field.'
    };
  }

  // Ensure form state session exists
  if (!formStateService.hasSession(applicationId)) {
    await formStateService.startSession(applicationId);
  }

  // Update both forms via FormStateService
  const results = formStateService.updateFieldAcrossForms(applicationId, unifiedFieldName, value);

  // Calculate updated progress
  const formProgress = formStateService.calculateProgress(applicationId);

  // Mark as dirty for periodic save
  const state = formStateService.getState(applicationId);
  if (state) {
    state.dirty = true;
  }

  console.log(`✅ Unified field "${unifiedFieldName}" saved to both forms`);
  console.log(`   Progress: SBA_1919=${formProgress?.SBA_1919}%, SBA_413=${formProgress?.SBA_413}%`);

  return {
    success: true,
    message: `Saved "${unifiedFieldName}" to both forms.`,
    instruction: 'Value saved to both forms. Ask the next question.',
    data: {
      unified: true,
      unifiedFieldName,
      value,
      formProgress,
      SBA_1919: results.SBA_1919,
      SBA_413: results.SBA_413
    }
  };
};

/**
 * Handle captureSkipField tool - skips current field and highlights next empty field
 * Now uses FormStateService for automatic state tracking (no emptyFields param needed)
 */
export const handleCaptureSkipField = async (
  sessionId: string,
  args: { formType?: 'SBA_1919' | 'SBA_413' },
  applicationId?: string
): Promise<ToolResult> => {
  const { formType } = args;
  const rooms = getRooms(sessionId);
  const activeFormType = formType || 'SBA_1919';
  const formLabel = activeFormType === 'SBA_413' ? '[Form 413]' : '[Form 1919]';

  // Use FormStateService if we have an active session
  if (applicationId && formStateService.hasSession(applicationId)) {
    const result = formStateService.skipField(applicationId, activeFormType);

    if (!result.success) {
      return {
        success: false,
        message: result.message || 'Failed to skip field'
      };
    }

    if (!result.nextField) {
      return {
        success: true,
        message: 'No more empty fields. Form is complete.',
        instruction: "Tell them the form is complete and ask if they want to review it"
      };
    }

    // Broadcast highlight event for the next field
    websocketService.broadcast('highlight-fields', {
      sessionId,
      timestamp: new Date().toISOString(),
      field: result.nextField,
      text: '',
      formType: activeFormType,
      source: 'chat'
    }, rooms);

    const nextFieldLabel = getFieldLabel(activeFormType, result.nextField);
    let instruction = `The next empty field is "${result.nextField}" (${nextFieldLabel}). Ask the user about this field.`;
    if (result.wasRequired) {
      instruction = `Note: "${result.skippedField}" was a required field. ` + instruction;
    }

    return {
      success: true,
      message: `${formLabel} Skipped "${result.skippedField}", now highlighting "${result.nextField}".`,
      instruction,
      data: {
        skippedField: result.skippedField,
        nextField: result.nextField,
        wasRequired: result.wasRequired
      }
    };
  }

  // Fallback: no active form state session
  return {
    success: false,
    message: 'No active form state session. Please select an application first.',
    instruction: "Ask the user to select an application to continue"
  };
};

/**
 * Handle captureCheckboxSelection tool
 */
export const handleCaptureCheckboxSelection = async (
  sessionId: string,
  args: { group?: string; value?: string; formType?: 'SBA_1919' | 'SBA_413' }
): Promise<ToolResult> => {
  let { group, value, formType } = args;
  const rooms = getRooms(sessionId);

  // Default to SBA_1919 if not specified
  const activeFormType = formType || 'SBA_1919';
  const formLabel = activeFormType === 'SBA_413' ? '[Form 413]' : '[Form 1919]';

  // Normalize: trim whitespace and newlines
  group = group?.trim();
  value = value?.trim();

  // Validate required parameters
  if (!group || !value) {
    return {
      success: false,
      message: 'Both group and value are required'
    };
  }

  // Select appropriate checkbox groups based on form type
  const checkboxGroups = activeFormType === 'SBA_413' ? CHECKBOX_GROUPS_413 : CHECKBOX_GROUPS;
  const getCheckboxesFn = activeFormType === 'SBA_413' ? getGroupCheckboxes413 : getGroupCheckboxes;

  // Validate group exists
  const groupConfig = checkboxGroups[group];
  if (!groupConfig) {
    return {
      success: false,
      message: `Unknown checkbox group: ${group}. Available groups: ${Object.keys(checkboxGroups).join(', ')}`
    };
  }

  // Validate value exists in group options
  const fieldName = groupConfig.options[value];
  if (!fieldName) {
    return {
      success: false,
      message: `Unknown value '${value}' for group '${group}'. Available values: ${Object.keys(groupConfig.options).join(', ')}`
    };
  }


  // Store PDF field name in session userData
  await updateUserData(sessionId, { [fieldName]: true });

  // Get all checkboxes in group for exclusive groups
  let groupCheckboxes: string[] | undefined = undefined;
  if (groupConfig.exclusive) {
    groupCheckboxes = getCheckboxesFn(group);
  }

  // Broadcast to WebSocket
  websocketService.broadcast('checkbox-selection', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { [fieldName]: true },
    fieldType: 'checkbox',
    formType: activeFormType,
    groupCheckboxes,
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: `${formLabel} Checkbox "${value}" in group "${group}" captured.`,
    instruction: "Acknowledge the selection briefly",
    data: { fieldName, groupCheckboxes }
  };
};

/**
 * Handle captureLoan tool
 */
export const handleCaptureLoan = async (
  sessionId: string,
  args: { loanAmount?: number; loanType?: string; loanPurpose?: string }
): Promise<ToolResult> => {
  const { loanAmount, loanType, loanPurpose } = args;
  const rooms = getRooms(sessionId);

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { loanAmount, loanType, loanPurpose },
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: 'Loan information captured.',
    instruction: "Acknowledge the loan information"
  };
};

/**
 * Handle conversation flow detection
 * Persists flow to MongoDB so LLM can be reminded of current flow
 */
export const handleDetectConversationFlow = async (
  sessionId: string,
  args: { flow?: string }
): Promise<ToolResult> => {
  const flow = args.flow;

  // Validate flow value
  const validFlows = ['continue_application', 'new_application', 'check_status'];
  if (!flow || !validFlows.includes(flow)) {
    return {
      success: false,
      message: `Invalid flow: ${flow}`
    };
  }

  // Persist flow to MongoDB so it survives between messages
  await updateUserData(sessionId, { currentFlow: flow });

  return {
    success: true,
    message: `Flow detected: ${flow}`,
    instruction: "Route to appropriate flow and ask the first question",
    data: { flow }
  };
};

/**
 * Calculate SBA eligibility chances for BUYER
 */
export const handleChancesUserSBAApprovedBUYER = async (
  sessionId: string,
  args: {
    purchasePrice?: number;
    availableCash?: number;
    businessCashFlow?: number;
    buyerCreditScore?: number;
    isUSCitizen?: boolean;
    businessYearsRunning?: number;
    industryExperience?: string;
  }
): Promise<ToolResult> => {
  const {
    purchasePrice,
    availableCash,
    businessCashFlow,
    buyerCreditScore,
    isUSCitizen,
    businessYearsRunning,
    industryExperience
  } = args;

  // Validate required fields
  if (!purchasePrice || !availableCash || !businessCashFlow || !buyerCreditScore || isUSCitizen === undefined || !businessYearsRunning) {
    return {
      success: false,
      message: 'Missing required fields for buyer eligibility calculation'
    };
  }

  try {
    // Call the existing eligibility calculation function
    const result = calculateSBAEligibilityForBuyer({
      purchasePrice: String(purchasePrice),
      availableCash: String(availableCash),
      businessCashFlow: String(businessCashFlow),
      buyerCreditScore: String(buyerCreditScore),
      isUSCitizen,
      businessYearsRunning,
      industryExperience
    });

    const applicantData: any = {
      name: "Undisclosed",
      businessName: "Undisclosed",
      businessPhoneNumber: "",
      userType: 'buyer',
      creditScore: Number(buyerCreditScore || 0),
      yearFounded: Number(new Date().getFullYear()) - Number(businessYearsRunning || 0),
      isUSCitizen: isUSCitizen === true,
      purchasePrice: String(purchasePrice || ''),
      availableCash: String(availableCash || ''),
      businessCashFlow: String(businessCashFlow || ''),
      industryExperience: String(industryExperience || '')
    };

    // Create draft application
    const draftApp = await createDraft(applicantData as SBAApplicationData, result);
    const draftApplicationId = draftApp._id?.toString();

    if (!draftApplicationId) {
      throw new Error('Failed to create draft application');
    }

    // Generate draft PDFs
    const draftPDFs = await generateDraftPDFs(applicantData, draftApplicationId);

    // Update draft application with PDF info
    await Application.findByIdAndUpdate(draftApplicationId, {
      draftDocuments: draftPDFs
    });

    // Generate presigned URLs for the draft documents
    const documentsWithUrls = await Promise.all(
      draftPDFs.map(async (doc) => ({
        name: doc.fileName,
        url: await generatePresignedUrl(doc.s3Key, 3600), // 1 hour expiration
        type: doc.fileType
      }))
    );


    return {
      success: true,
      message: `Eligibility calculated: ${result.chance} chance`,
      instruction: "Present their approval chances and list the reasons. If eligible, ask if they're ready to fill out the form",
      data: {
        score: result.score,
        chance: result.chance,
        reasons: result.reasons,
        draftApplicationId,
        documents: documentsWithUrls
      }
    };
  } catch (error) {
    console.error('❌ Error calculating buyer eligibility:', error);
    return {
      success: false,
      message: `Error calculating eligibility: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Calculate SBA eligibility chances for OWNER
 */
export const handleChancesUserSBAApprovedOWNER = async (
  sessionId: string,
  args: {
    monthlyRevenue?: number;
    monthlyExpenses?: number;
    existingDebtPayment?: number;
    requestedLoanAmount?: number;
    ownerCreditScore?: number;
    isUSCitizen?: boolean;
    businessYearsRunning?: number;
  }
): Promise<ToolResult> => {
  const {
    monthlyRevenue,
    monthlyExpenses,
    existingDebtPayment,
    requestedLoanAmount,
    ownerCreditScore,
    isUSCitizen,
    businessYearsRunning
  } = args;

  // Validate required fields
  if (!monthlyRevenue || !monthlyExpenses || !requestedLoanAmount || !ownerCreditScore || isUSCitizen === undefined || !businessYearsRunning) {
    return {
      success: false,
      message: 'Missing required fields for owner eligibility calculation'
    };
  }
  try {
    // Call the existing eligibility calculation function
    const result = calculateSBAEligibilityForOwner({
      monthlyRevenue: String(monthlyRevenue),
      monthlyExpenses: String(monthlyExpenses),
      existingDebtPayment: String(existingDebtPayment || 0),
      requestedLoanAmount: String(requestedLoanAmount),
      loanPurpose: 'Working Capital', // Default value
      ownerCreditScore: String(ownerCreditScore),
      isUSCitizen,
      businessYearsRunning
    });
    const applicantData: any = {
      name: "Undisclosed",
      businessName: "Undisclosed",
      businessPhoneNumber: "",
      userType: 'owner',
      creditScore: Number(args.ownerCreditScore || args.ownerCreditScore || 0),
      yearFounded: Number(new Date().getFullYear()) - Number(args.businessYearsRunning || 0),
      isUSCitizen: args.isUSCitizen === true,
      monthlyRevenue: String(args.monthlyRevenue || ''),
      monthlyExpenses: String(args.monthlyExpenses || ''),
      existingDebtPayment: String(args.existingDebtPayment || ''),
      requestedLoanAmount: String(args.requestedLoanAmount || '')
    };

    // Create draft application
    const draftApp = await createDraft(applicantData as SBAApplicationData, result);
    const draftApplicationId = draftApp._id?.toString();

    if (!draftApplicationId) {
      throw new Error('Failed to create draft application');
    }

    // Generate draft PDFs
    const draftPDFs = await generateDraftPDFs(applicantData, draftApplicationId);

    // Update draft application with PDF info
    await Application.findByIdAndUpdate(draftApplicationId, {
      draftDocuments: draftPDFs
    });

    // Generate presigned URLs for the draft documents
    const documentsWithUrls = await Promise.all(
      draftPDFs.map(async (doc) => ({
        name: doc.fileName,
        url: await generatePresignedUrl(doc.s3Key, 3600), // 1 hour expiration
        type: doc.fileType
      }))
    );

    return {
      success: true,
      message: `Eligibility calculated: ${result.chance} chance`,
      instruction: "Present their approval chances and list the reasons. If eligible, ask if they're ready to fill out the form",
      data: {
        score: result.score,
        chance: result.chance,
        reasons: result.reasons,
        draftApplicationId,
        documents: documentsWithUrls
      }
    };
  } catch (error) {
    console.error('❌ Error calculating owner eligibility:', error);
    return {
      success: false,
      message: `Error calculating eligibility: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Retrieve application status by identifier
 */
export const handleRetrieveApplicationStatus = async (
  sessionId: string,
  args: { identifier?: string }
): Promise<ToolResult> => {
  const { identifier } = args;

  if (!identifier) {
    return {
      success: false,
      message: 'Identifier is required'
    };
  }

  try {
    // Search by business name, phone, or application ID
    const application = await Application.findOne({
      $or: [
        { _id: identifier },
        { 'applicantData.businessName': { $regex: new RegExp(identifier, 'i') } },
        { 'applicantData.businessPhoneNumber': identifier }
      ]
    }).populate('banks.bank');

    if (!application) {
      return {
        success: false,
        message: `No application found for: ${identifier}`
      };
    }


    // Generate presigned URLs for all document types
    const expiresIn = 3600; // 1 hour default

    const [userProvidedDocuments, draftDocuments] = await Promise.all([
      Promise.all(
        (application.userProvidedDocuments || []).map(async (doc) => ({
          fileName: doc.fileName,
          s3Key: doc.s3Key,
          url: await generatePresignedUrl(doc.s3Key, expiresIn),
          uploadedAt: doc.uploadedAt,
          fileType: doc.fileType,
          expiresIn
        }))
      ),
      Promise.all(
        (application.draftDocuments || []).map(async (doc: any) => ({
          fileName: doc.fileName,
          s3Key: doc.s3Key,
          url: await generatePresignedUrl(doc.s3Key, expiresIn),
          generatedAt: doc.generatedAt,
          fileType: doc.fileType,
          expiresIn,
          signed: doc.signed || false
        }))
      )
    ]);

    // Return comprehensive application data with presigned URLs
    return {
      success: true,
      message: 'Application found',
      instruction: "Summarize their application status based on the data returned",
      data: {
        applicationId: application._id.toString(),
        status: application.status,
        applicantData: application.applicantData,
        loanChances: application.loanChances,
        banks: application.banks,
        offers: application.offers,
        documents: {
          userProvided: userProvidedDocuments,
          draft: draftDocuments
        },
        signing: {
          provider: application.signingProvider,
          status: application.signingStatus,
          signedBy: application.signedBy,
          signedDate: application.signedDate
        },
        createdAt: application.createdAt,
        updatedAt: application.updatedAt
      }
    };
  } catch (error) {
    console.error('❌ Error retrieving application:', error);
    return {
      success: false,
      message: `Error retrieving application: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Get filled and empty fields for form continuation
 */
export const handleGetFilledFields = async (
  sessionId: string,
  args: { applicationId?: string }
): Promise<ToolResult> => {
  const { applicationId } = args;

  if (!applicationId) {
    return {
      success: false,
      message: 'Application ID is required'
    };
  }

  try {
    const application = await Application.findById(applicationId);

    if (!application) {
      return {
        success: false,
        message: `Application not found: ${applicationId}`
      };
    }

    // Start or get existing FormStateService session (loads from MongoDB)
    let state = formStateService.getState(applicationId);
    if (!state) {
      console.log('📋 Starting FormStateService session for getFilledFields');
      state = await formStateService.startSession(applicationId);
    }

    // Extract field state from FormStateService
    const result1919 = {
      filledFields: state.sba1919.filledFields,
      emptyFields: state.sba1919.emptyFields,
      allFields: state.sba1919.allFields
    };

    const result413 = {
      filledFields: state.sba413.filledFields,
      emptyFields: state.sba413.emptyFields,
      allFields: state.sba413.allFields
    };

    // Map draft documents to ChatDocument[]
    const documents: ChatDocument[] = await Promise.all(
      (application.draftDocuments || []).map(async (doc: any) => ({
        name: doc.fileName,
        type: doc.fileType,
        url: await generatePresignedUrl(doc.s3Key, 3600)
      }))
    );

    // Calculate form progress percentages
    const formProgress = formStateService.calculateProgress(applicationId);

    return {
      success: true,
      message: 'Field analysis complete',
      instruction: "Tell them you found their application and will continue from where they left off",
      data: {
        sba1919: {
          filledFields: result1919.filledFields,
          emptyFields: result1919.emptyFields,
          allFields: result1919.allFields,
          url: application.draftDocuments?.find((doc: any) => doc.fileName.includes('SBA_1919'))?.s3Key || null
        },
        sba413: {
          filledFields: result413.filledFields,
          emptyFields: result413.emptyFields,
          allFields: result413.allFields,
          url: application.draftDocuments?.find((doc: any) => doc.fileName.includes('SBA_413'))?.s3Key || null
        },
        documents,
        formProgress
      }
    };
  } catch (error) {
    console.error('❌ Error getting filled fields:', error);
    return {
      success: false,
      message: `Error analyzing fields: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * Retrieve all applications for selection
 */
export const handleRetrieveAllApplications = async (
  sessionId: string,
  args: {}
): Promise<ToolResult> => {
  try {
    // Retrieve all applications sorted by most recent
    const applications = await Application.find()
      .sort({ updatedAt: -1 })
      .limit(50) // Limit to prevent overwhelming user
      .select('_id applicantData.businessName applicantData.businessPhoneNumber status loanChances createdAt updatedAt');

    const applicationList = applications.map(app => ({
      applicationId: app._id.toString(),
      businessName: app.applicantData?.businessName || 'Unknown',
      status: app.status,
      loanChance: app.loanChances?.chance || 'N/A',
      lastUpdated: app.updatedAt
    }));


    return {
      success: true,
      message: `Found ${applicationList.length} applications`,
      instruction: "List their applications and ask them to select one",
      data: { applications: applicationList }
    };
  } catch (error) {
    console.error('❌ Error retrieving applications:', error);
    return {
      success: false,
      message: `Error retrieving applications: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
};

/**
 * End conversation signal
 */
export const handleEndConversation = async (
  sessionId: string,
  args: { reason?: string }
): Promise<ToolResult> => {
  const { reason = 'completed' } = args;


  // Optionally broadcast conversation end event
  const rooms = getRooms(sessionId);
  websocketService.broadcast('conversation-ended', {
    sessionId,
    timestamp: new Date().toISOString(),
    reason,
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: `Conversation ended: ${reason}`,
    instruction: "Thank them for chatting and wish them well",
    data: { reason }
  };
};

/**
 * Handle checkSubmissionReadiness tool
 * Returns which forms are ready for submission and what's missing
 */
export const handleCheckSubmissionReadiness = async (
  sessionId: string,
  args: {},
  applicationId?: string
): Promise<ToolResult> => {
  if (!applicationId || !formStateService.hasSession(applicationId)) {
    return {
      success: false,
      message: 'No active form state session. Please select an application first.'
    };
  }

  const readiness = formStateService.checkSubmissionReadiness(applicationId);

  // If all forms are ready, trigger background PDF update
  if (readiness.allReady && applicationId) {
    // Fire and forget - don't block the response
    updateDraftPDFsInBackground(sessionId, applicationId)
      .catch(err => console.error('Background PDF update failed:', err));
  }

  let instruction: string;
  if (readiness.allReady) {
    instruction = "Tell them both forms are complete and ready for submission! Ask if they want to submit now.";
  } else {
    const missing: string[] = [];
    if (!readiness.sba1919.ready) {
      missing.push(`Form 1919 needs: ${readiness.sba1919.missing.join(', ')}`);
    }
    if (!readiness.sba413.ready) {
      missing.push(`Form 413 needs: ${readiness.sba413.missing.join(', ')}`);
    }
    instruction = `Tell them which forms are incomplete and what's missing. Missing: ${missing.join('; ')}`;
  }

  return {
    success: true,
    message: `Form 1919: ${readiness.sba1919.ready ? 'READY' : 'NOT READY'}. Form 413: ${readiness.sba413.ready ? 'READY' : 'NOT READY'}.`,
    instruction,
    data: readiness
  };
};

/**
 * Execute a tool call by name
 * @param sessionId - The chat session ID
 * @param toolName - The name of the tool to execute
 * @param args - Tool arguments
 * @param applicationId - Optional application ID for form state tracking
 */
export const executeToolCall = async (
  sessionId: string,
  toolName: string,
  args: Record<string, any>,
  applicationId?: string
): Promise<ToolResult> => {
  switch (toolName) {
    case 'captureUserName':
      return handleCaptureUserName(sessionId, args);
    case 'captureBusinessName':
      return handleCaptureBusinessName(sessionId, args);
    case 'captureBusinessPhone':
      return handleCaptureBusinessPhone(sessionId, args);
    case 'captureCreditScore':
      return handleCaptureCreditScore(sessionId, args);
    case 'captureYearFounded':
      return handleCaptureYearFounded(sessionId, args);
    case 'captureUSCitizen':
      return handleCaptureUSCitizen(sessionId, args);
    case 'captureAnnualRevenue':
      return handleCaptureAnnualRevenue(sessionId, args);
    case 'captureMonthlyRevenue':
      return handleCaptureMonthlyRevenue(sessionId, args);
    case 'captureMonthlyExpenses':
      return handleCaptureMonthlyExpenses(sessionId, args);
    case 'captureExistingDebtPayment':
      return handleCaptureExistingDebtPayment(sessionId, args);
    case 'captureRequestedLoanAmount':
      return handleCaptureRequestedLoanAmount(sessionId, args);
    case 'captureLoanPurpose':
      return handleCaptureLoanPurpose(sessionId, args);
    case 'capturePurchasePrice':
      return handleCapturePurchasePrice(sessionId, args);
    case 'captureAvailableCash':
      return handleCaptureAvailableCash(sessionId, args);
    case 'captureBusinessCashFlow':
      return handleCaptureBusinessCashFlow(sessionId, args);
    case 'captureIndustryExperience':
      return handleCaptureIndustryExperience(sessionId, args);
    case 'captureUserTypeNewApplication':
      return handleCaptureUserTypeNewApplication(sessionId, args);
    case 'captureSellingFinancingPercentage':
      return handleCaptureSellingFinancingPercentage(sessionId, args);
    case 'captureIfSellerFinancingOnStandbyExists':
      return handleCaptureIfSellerFinancingOnStandbyExists(sessionId, args);
    case 'captureOpenSBAForm':
      return handleCaptureOpenSBAForm(sessionId, args);
    case 'captureHighlightField':
      return handleCaptureHighlightField(sessionId, args, applicationId);
    case 'captureUnifiedField':
      return handleCaptureUnifiedField(sessionId, args, applicationId);
    case 'captureSkipField':
      return handleCaptureSkipField(sessionId, args, applicationId);
    case 'captureCheckboxSelection':
      return handleCaptureCheckboxSelection(sessionId, args);
    case 'captureLoan':
      return handleCaptureLoan(sessionId, args);
    case 'detectConversationFlow':
      return handleDetectConversationFlow(sessionId, args);
    case 'chancesUserSBAApprovedBUYER':
      return handleChancesUserSBAApprovedBUYER(sessionId, args);
    case 'chancesUserSBAApprovedOWNER':
      return handleChancesUserSBAApprovedOWNER(sessionId, args);
    case 'retrieveApplicationStatus':
      return handleRetrieveApplicationStatus(sessionId, args);
    case 'getFilledFields':
      return handleGetFilledFields(sessionId, args);
    case 'retrieveAllApplications':
      return handleRetrieveAllApplications(sessionId, args);
    case 'checkSubmissionReadiness':
      return handleCheckSubmissionReadiness(sessionId, args, applicationId);
    case 'endConversation':
      return handleEndConversation(sessionId, args);
    default:
      console.warn(`⚠️ Unknown tool: ${toolName}`);
      return {
        success: false,
        message: `Unknown tool: ${toolName}`
      };
  }
};

// Re-export formStateService for convenience
export { default as formStateService } from './FormStateService.js';

export default {
  // Session management
  createSession,
  getSession,
  addMessage,
  updateUserData,
  linkApplication,
  deleteSession,
  // Tool dispatcher
  executeToolCall
};
