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

  await updateUserData(sessionId, { usCitizen });

  websocketService.broadcast('form-field-update', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { usCitizen },
    source: 'chat'
  }, rooms);

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
  args: { formType?: string; emptyFields?: string[] }
): Promise<ToolResult> => {
  const { formType, emptyFields } = args;
  const rooms = getRooms(sessionId);

  await updateUserData(sessionId, { formType });

  // Broadcast form open event with emptyFields
  websocketService.broadcast('open-sba-form', {
    sessionId,
    timestamp: new Date().toISOString(),
    fields: { formType },
    emptyFields: emptyFields || [],
    source: 'chat'
  }, rooms);

  // Auto-highlight first empty field if emptyFields provided
  // Add a small delay to ensure the form is rendered before highlighting
  if (emptyFields && emptyFields.length > 0) {
    const firstEmptyField = emptyFields[0];
    const activeFormType = (formType as 'SBA_1919' | 'SBA_413') || 'SBA_1919';
    const formLabel = activeFormType === 'SBA_413' ? '[Form 413]' : '[Form 1919]';
    // Delay highlighting by 3 seconds to allow form to render
    setTimeout(() => {
      websocketService.broadcast('highlight-fields', {
        sessionId,
        timestamp: new Date().toISOString(),
        field: firstEmptyField,
        text: '',  // Empty text, just highlighting
        formType: activeFormType,
        source: 'chat'
      }, rooms);

    }, 3000);

    return {
      success: true,
      message: `Form ${formType} opened with ${emptyFields.length} empty fields. Starting with "${firstEmptyField}".`,
      instruction: `Tell them you're opening ${formType} and starting with the first field: "${firstEmptyField}". Ask about that field.`
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
 */
export const handleCaptureHighlightField = async (
  sessionId: string,
  args: { field?: string; text?: string; formType?: 'SBA_1919' | 'SBA_413' }
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

  websocketService.broadcast('highlight-fields', {
    sessionId,
    timestamp: new Date().toISOString(),
    field,
    text,
    formType: activeFormType,
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: `${formLabel} Field "${field}" ${text ? 'filled with value and ' : ''}highlighted.`,
    instruction: text
      ? `Acknowledge the value was captured and ask about the next field in the form sequence`
      : `Ask the user for this field's value`,
    data: {
      field,
      text,
      formType,
      filled: !!text  // Boolean indicating if field was filled or just highlighted
    }
  };
};

/**
 * Handle captureSkipField tool - skips current field and highlights next empty field
 */
export const handleCaptureSkipField = async (
  sessionId: string,
  args: { currentField?: string; emptyFields?: string[]; formType?: 'SBA_1919' | 'SBA_413' }
): Promise<ToolResult> => {
  const { currentField, emptyFields, formType } = args;
  const rooms = getRooms(sessionId);

  if (!currentField) {
    return {
      success: false,
      message: 'Current field name is required'
    };
  }

  if (!emptyFields || emptyFields.length === 0) {
    return {
      success: true,
      message: 'No more empty fields to skip to. Form is complete.',
      instruction: "Tell them the form is complete and ask if they want to review it"
    };
  }

  const activeFormType = formType || 'SBA_1919';
  const formLabel = activeFormType === 'SBA_413' ? '[Form 413]' : '[Form 1919]';

  // Find the index of the current field in the emptyFields array
  const currentIndex = emptyFields.indexOf(currentField);

  // Get the next field (either the one after current, or the first one if current not found)
  let nextField: string;
  if (currentIndex === -1) {
    // Current field not in emptyFields, start from the first empty field
    nextField = emptyFields[0];
  } else if (currentIndex >= emptyFields.length - 1) {
    // Current field is the last one, form is complete
    return {
      success: true,
      message: 'No more empty fields. Form is complete.',
      instruction: "Tell them the form is complete and ask if they want to review it"
    };
  } else {
    // Get the next field in the array
    nextField = emptyFields[currentIndex + 1];
  }


  // Broadcast highlight event for the next field
  websocketService.broadcast('highlight-fields', {
    sessionId,
    timestamp: new Date().toISOString(),
    field: nextField,
    text: '',  // Empty text, just highlighting
    formType: activeFormType,
    source: 'chat'
  }, rooms);

  return {
    success: true,
    message: `${formLabel} Skipped "${currentField}", now highlighting "${nextField}".`,
    instruction: `The next empty field is "${nextField}". Ask the user about this field.`,
    data: {
      skippedField: currentField,
      nextField,
      remainingFields: emptyFields.slice(currentIndex + 2) // Fields after the next one
    }
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
 * No MongoDB update needed - just return the flow value
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

  // No MongoDB update needed - just return the flow
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

    const doc1919 = application.draftDocuments?.find((d: any) => d.fileType === 'SBA_1919');
    const doc413 = application.draftDocuments?.find((d: any) => d.fileType === 'SBA_413');

    // Helper function to process a single form
    const processForm = async (document: any, formType: 'SBA_1919' | 'SBA_413') => {
      try {
        const pdfBuffer = await downloadDocument(document.s3Key);
        const result = await extractFormFieldValues(pdfBuffer);
        return result;
      } catch (error) {
        console.warn(`⚠️ Could not process ${formType}:`, error);
        return { filledFields: [], emptyFields: [], allFields: {} };
      }
    };

    // Process both forms in parallel
    const [result1919, result413] = await Promise.all([
      doc1919 ? processForm(doc1919, 'SBA_1919') : Promise.resolve({ filledFields: [], emptyFields: [], allFields: {} }),
      doc413 ? processForm(doc413, 'SBA_413') : Promise.resolve({ filledFields: [], emptyFields: [], allFields: {} })
    ]);

    // Map draft documents to ChatDocument[]
    const documents: ChatDocument[] = await Promise.all(
      (application.draftDocuments || []).map(async (doc: any) => ({
        name: doc.fileName,
        type: doc.fileType,
        url: await generatePresignedUrl(doc.s3Key, 3600)
      }))
    );

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
        documents
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

// ==============================
// TOOL DISPATCHER
// ==============================

/**
 * Execute a tool call by name
 */
export const executeToolCall = async (
  sessionId: string,
  toolName: string,
  args: Record<string, any>
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
      return handleCaptureHighlightField(sessionId, args);
    case 'captureSkipField':
      return handleCaptureSkipField(sessionId, args);
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
