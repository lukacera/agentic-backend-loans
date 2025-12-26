/**
 * FormStateService - In-memory form state management
 *
 * Manages form state for SBA loan applications in memory to avoid
 * repeated database reads. State is loaded once at session start
 * and saved at session end or on periodic auto-save.
 */

import { Application } from '../models/Application.js';
import {
  SBA_1919_FIELD_NAMES,
  SBA_413_FIELD_NAMES,
  SBA_1919_REQUIRED,
  SBA_413_REQUIRED,
  createEmptyFieldsObject,
  getFieldNamesForForm,
  getRequiredFieldsForForm,
  isFieldRequired,
  getFieldLabel
} from './formFields.js';
import { getFieldMapping, getEntityTypeMapping } from './fieldMapping.js';

// ==============================
// TYPES FOR PROGRESS
// ==============================

export interface FormProgress {
  SBA_1919: number;
  SBA_413: number;
}

// ==============================
// TYPES
// ==============================

export type FormType = 'SBA_1919' | 'SBA_413';

export interface FormStateEntry {
  filledFields: string[];
  emptyFields: string[];
  missingRequired: string[];
  isSubmittable: boolean;
  allFields: Record<string, string | boolean>;
  currentFieldIndex: number;
}

export interface FormState {
  applicationId: string;
  currentForm: FormType | null;
  sba1919: FormStateEntry;
  sba413: FormStateEntry;
  dirty: boolean;
  lastSaved: Date | null;
}

export interface UpdateFieldResult {
  success: boolean;
  nextField: string | null;
  isSubmittable: boolean;
  message?: string;
}

export interface SkipFieldResult {
  success: boolean;
  skippedField: string;
  nextField: string | null;
  wasRequired: boolean;
  message?: string;
}

export interface CrossFormUpdateResult {
  SBA_1919: UpdateFieldResult | null;
  SBA_413: UpdateFieldResult | null;
}

// ==============================
// IN-MEMORY STATE STORE
// ==============================

const stateStore: Map<string, FormState> = new Map();

// ==============================
// HELPER FUNCTIONS
// ==============================

/**
 * Calculate filled/empty/missing required fields from allFields object
 * Handles both string and boolean field values
 */
const calculateFieldLists = (
  formType: FormType,
  allFields: Record<string, string | boolean>
): Pick<FormStateEntry, 'filledFields' | 'emptyFields' | 'missingRequired' | 'isSubmittable'> => {
  const fieldNames = getFieldNamesForForm(formType);
  const requiredFields = getRequiredFieldsForForm(formType);

  const filledFields: string[] = [];
  const emptyFields: string[] = [];

  for (const name of fieldNames) {
    const value = allFields[name];
    // For booleans: true = filled, false = empty
    // For strings: non-empty trimmed string = filled
    const isFilled = typeof value === 'boolean'
      ? value === true
      : (typeof value === 'string' && value.trim() !== '');

    if (isFilled) {
      filledFields.push(name);
    } else {
      emptyFields.push(name);
    }
  }

  const missingRequired = requiredFields.filter(name => emptyFields.includes(name));
  const isSubmittable = missingRequired.length === 0;

  return { filledFields, emptyFields, missingRequired, isSubmittable };
};

/**
 * Create initial form state entry
 */
const createFormStateEntry = (
  formType: FormType,
  existingFields?: Record<string, string | boolean>
): FormStateEntry => {
  const allFields = existingFields || createEmptyFieldsObject(formType);
  const { filledFields, emptyFields, missingRequired, isSubmittable } = calculateFieldLists(formType, allFields);

  return {
    filledFields,
    emptyFields,
    missingRequired,
    isSubmittable,
    allFields,
    currentFieldIndex: 0
  };
};

// ==============================
// SERVICE METHODS
// ==============================

/**
 * Start a form state session for an application
 * Loads data from DB once and caches in memory
 */
export const startSession = async (applicationId: string): Promise<FormState> => {
  // Check if already in memory
  const existing = stateStore.get(applicationId);
  if (existing) {
    console.log(`📋 Form state session already exists for ${applicationId}`);
    return existing;
  }

  console.log(`📋 Starting form state session for ${applicationId}`);

  // Load from database
  const application = await Application.findById(applicationId);

  let sba1919Fields: Record<string, string | boolean> = createEmptyFieldsObject('SBA_1919');
  let sba413Fields: Record<string, string | boolean> = createEmptyFieldsObject('SBA_413');

  if (application) {
    // Load existing field values if available
    if (application.get('sba1919Fields')) {
      sba1919Fields = { ...sba1919Fields, ...application.get('sba1919Fields') };
    }
    if (application.get('sba413Fields')) {
      sba413Fields = { ...sba413Fields, ...application.get('sba413Fields') };
    }
  }

  const state: FormState = {
    applicationId,
    currentForm: null,
    sba1919: createFormStateEntry('SBA_1919', sba1919Fields),
    sba413: createFormStateEntry('SBA_413', sba413Fields),
    dirty: false,
    lastSaved: null
  };

  stateStore.set(applicationId, state);
  console.log(`✅ Form state session started for ${applicationId}`);
  console.log(state)
  return state;
};

/**
 * Get current form state from memory (no DB read)
 */
export const getState = (applicationId: string): FormState | null => {
  return stateStore.get(applicationId) || null;
};

/**
 * Check if a session exists in memory
 */
export const hasSession = (applicationId: string): boolean => {
  return stateStore.has(applicationId);
};

/**
 * Set the current active form
 */
export const setCurrentForm = (applicationId: string, formType: FormType): boolean => {
  const state = stateStore.get(applicationId);
  if (!state) {
    console.warn(`⚠️ No session found for ${applicationId}`);
    return false;
  }

  state.currentForm = formType;
  return true;
};

/**
 * Update a field value in memory
 * Returns the next empty field automatically
 */
export const updateField = (
  applicationId: string,
  formType: FormType,
  fieldName: string,
  value: string | boolean
): UpdateFieldResult => {
  const state = stateStore.get(applicationId);
  if (!state) {
    return {
      success: false,
      nextField: null,
      isSubmittable: false,
      message: `No session found for ${applicationId}`
    };
  }

  const formState = formType === 'SBA_1919' ? state.sba1919 : state.sba413;
  const fieldNames = getFieldNamesForForm(formType);

  // Validate field exists
  if (!fieldNames.includes(fieldName)) {
    return {
      success: false,
      nextField: null,
      isSubmittable: formState.isSubmittable,
      message: `Unknown field: ${fieldName}`
    };
  }

  // Update the field
  formState.allFields[fieldName] = value;
  state.dirty = true;

  // Recalculate field lists
  const { filledFields, emptyFields, missingRequired, isSubmittable } = calculateFieldLists(
    formType,
    formState.allFields
  );
  formState.filledFields = filledFields;
  formState.emptyFields = emptyFields;
  formState.missingRequired = missingRequired;
  formState.isSubmittable = isSubmittable;

  // Find current field index and determine next field
  const currentIndex = fieldNames.indexOf(fieldName);
  formState.currentFieldIndex = currentIndex;

  // Get next empty field after current position
  let nextField: string | null = null;
  for (let i = currentIndex + 1; i < fieldNames.length; i++) {
    if (emptyFields.includes(fieldNames[i])) {
      nextField = fieldNames[i];
      break;
    }
  }

  // If no empty field after current, wrap to beginning
  if (!nextField) {
    for (let i = 0; i < currentIndex; i++) {
      if (emptyFields.includes(fieldNames[i])) {
        nextField = fieldNames[i];
        break;
      }
    }
  }

  console.log(`📝 Updated ${formType}.${fieldName} = "${value}", next: ${nextField || 'COMPLETE'}`);

  return {
    success: true,
    nextField,
    isSubmittable,
    message: nextField ? undefined : 'All fields filled'
  };
};

/**
 * Skip the current field and move to next
 */
export const skipField = (
  applicationId: string,
  formType: FormType
): SkipFieldResult => {
  const state = stateStore.get(applicationId);
  if (!state) {
    return {
      success: false,
      skippedField: '',
      nextField: null,
      wasRequired: false,
      message: `No session found for ${applicationId}`
    };
  }

  const formState = formType === 'SBA_1919' ? state.sba1919 : state.sba413;
  const fieldNames = getFieldNamesForForm(formType);

  // Get current field (the one being skipped)
  const currentIndex = formState.currentFieldIndex;
  const skippedField = formState.emptyFields[0] || fieldNames[currentIndex] || '';
  const wasRequired = isFieldRequired(formType, skippedField);

  // Find next empty field
  const skippedIndex = fieldNames.indexOf(skippedField);
  let nextField: string | null = null;

  for (let i = skippedIndex + 1; i < fieldNames.length; i++) {
    if (formState.emptyFields.includes(fieldNames[i])) {
      nextField = fieldNames[i];
      formState.currentFieldIndex = i;
      break;
    }
  }

  // If no more empty fields, form is complete (or all remaining are skipped)
  if (!nextField && formState.emptyFields.length > 1) {
    // Wrap around to find any remaining empty fields
    for (let i = 0; i < skippedIndex; i++) {
      if (formState.emptyFields.includes(fieldNames[i])) {
        nextField = fieldNames[i];
        formState.currentFieldIndex = i;
        break;
      }
    }
  }

  console.log(`⏭️ Skipped ${formType}.${skippedField} (required: ${wasRequired}), next: ${nextField || 'COMPLETE'}`);

  return {
    success: true,
    skippedField,
    nextField,
    wasRequired,
    message: wasRequired ? `Skipped required field: ${getFieldLabel(formType, skippedField)}` : undefined
  };
};

/**
 * Get the next empty field for a form
 */
export const getNextField = (applicationId: string, formType: FormType): string | null => {
  const state = stateStore.get(applicationId);
  if (!state) return null;

  const formState = formType === 'SBA_1919' ? state.sba1919 : state.sba413;
  return formState.emptyFields[0] || null;
};

/**
 * Save current state to database
 */
export const saveSession = async (applicationId: string): Promise<boolean> => {
  const state = stateStore.get(applicationId);
  if (!state) {
    console.warn(`⚠️ No session to save for ${applicationId}`);
    return false;
  }

  if (!state.dirty) {
    console.log(`📋 No changes to save for ${applicationId}`);
    return true;
  }

  try {
    // Build $set object with dot notation for individual field updates
    const updateFields: Record<string, any> = {};

    // Add SBA 1919 fields with dot notation
    for (const [fieldName, fieldValue] of Object.entries(state.sba1919.allFields)) {
      updateFields[`sba1919Fields.${fieldName}`] = fieldValue;
    }

    // Add SBA 413 fields with dot notation
    for (const [fieldName, fieldValue] of Object.entries(state.sba413.allFields)) {
      updateFields[`sba413Fields.${fieldName}`] = fieldValue;
    }

    console.log(`💾 Updating ${Object.keys(updateFields).length} fields for ${applicationId}`);

    // Update with $set operator for atomic field-level updates
    await Application.findByIdAndUpdate(
      applicationId,
      { $set: updateFields },
      { new: true, strict: false } // Return updated doc, disable strict mode for nested fields
    );

    state.dirty = false;
    state.lastSaved = new Date();
    console.log(`✅ Saved form state for ${applicationId} (${Object.keys(updateFields).length} fields)`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to save form state for ${applicationId}:`, error);
    return false;
  }
};

/**
 * End session - save to DB and remove from memory
 */
export const endSession = async (applicationId: string): Promise<boolean> => {
  const saved = await saveSession(applicationId);
  stateStore.delete(applicationId);
  console.log(`🔚 Ended form state session for ${applicationId}`);
  return saved;
};

/**
 * Get minimal state context for LLM injection
 */
export const getStateContext = (applicationId: string): string => {
  const state = stateStore.get(applicationId);
  if (!state) {
    return '[FORM STATE]\nNo active form session.';
  }

  const currentForm = state.currentForm || 'None';
  const form1919 = state.sba1919;
  const form413 = state.sba413;

  // Get next field for current form
  let nextField = 'N/A';
  if (state.currentForm === 'SBA_1919' && form1919.emptyFields.length > 0) {
    nextField = form1919.emptyFields[0];
  } else if (state.currentForm === 'SBA_413' && form413.emptyFields.length > 0) {
    nextField = form413.emptyFields[0];
  } else if (state.currentForm && (
    (state.currentForm === 'SBA_1919' && form1919.emptyFields.length === 0) ||
    (state.currentForm === 'SBA_413' && form413.emptyFields.length === 0)
  )) {
    nextField = 'COMPLETE';
  }

  return `[FORM STATE]
    Current form: ${currentForm}
    Next field: ${nextField}
    Missing required (1919): ${form1919.missingRequired.join(', ') || 'None'} (${form1919.missingRequired.length} fields)
    Missing required (413): ${form413.missingRequired.join(', ') || 'None'} (${form413.missingRequired.length} fields)
    Form 1919 submittable: ${form1919.isSubmittable ? 'YES' : 'NO'}
    Form 413 submittable: ${form413.isSubmittable ? 'YES' : 'NO'}
  `;
};

/**
 * Check submission readiness for both forms
 */
export const checkSubmissionReadiness = (applicationId: string): {
  sba1919: { ready: boolean; missing: string[] };
  sba413: { ready: boolean; missing: string[] };
  allReady: boolean;
} => {
  const state = stateStore.get(applicationId);
  if (!state) {
    return {
      sba1919: { ready: false, missing: SBA_1919_REQUIRED },
      sba413: { ready: false, missing: SBA_413_REQUIRED },
      allReady: false
    };
  }

  return {
    sba1919: {
      ready: state.sba1919.isSubmittable,
      missing: state.sba1919.missingRequired
    },
    sba413: {
      ready: state.sba413.isSubmittable,
      missing: state.sba413.missingRequired
    },
    allReady: state.sba1919.isSubmittable && state.sba413.isSubmittable
  };
};

/**
 * Get all active sessions (for debugging/admin)
 */
export const getActiveSessions = (): string[] => {
  return Array.from(stateStore.keys());
};

/**
 * Clear all sessions (for testing/cleanup)
 */
export const clearAllSessions = (): void => {
  stateStore.clear();
  console.log('🧹 Cleared all form state sessions');
};

/**
 * Calculate form completion progress percentage
 * Returns percentage (0-100) for each form based on filled fields
 */
export const calculateProgress = (applicationId: string): FormProgress | null => {
  const state = stateStore.get(applicationId);
  if (!state) return null;

  const totalFields1919 = SBA_1919_FIELD_NAMES.length;
  const totalFields413 = SBA_413_FIELD_NAMES.length;

  return {
    SBA_1919: Math.round((state.sba1919.filledFields.length / totalFields1919) * 100),
    SBA_413: Math.round((state.sba413.filledFields.length / totalFields413) * 100)
  };
};

/**
 * Update a unified field across both forms
 * Uses field mapping to determine which fields to update in each form
 */
export const updateFieldAcrossForms = (
  applicationId: string,
  unifiedFieldName: string,
  value: string | boolean
): CrossFormUpdateResult => {
  const mapping = getFieldMapping(unifiedFieldName);

  if (!mapping) {
    console.warn(`⚠️ No mapping found for unified field: ${unifiedFieldName}`);
    return { SBA_1919: null, SBA_413: null };
  }

  const result: CrossFormUpdateResult = {
    SBA_1919: null,
    SBA_413: null
  };

  if (mapping.SBA_1919) {
    result.SBA_1919 = updateField(applicationId, 'SBA_1919', mapping.SBA_1919, value);
    console.log(`📝 Updated SBA_1919.${mapping.SBA_1919} = "${value}"`);
  }

  if (mapping.SBA_413) {
    result.SBA_413 = updateField(applicationId, 'SBA_413', mapping.SBA_413, value);
    console.log(`📝 Updated SBA_413.${mapping.SBA_413} = "${value}"`);
  }

  return result;
};

/**
 * Update entity type checkbox across both forms
 * Clears other entity checkboxes and sets the selected one
 */
export const updateEntityTypeAcrossForms = (
  applicationId: string,
  entityType: string
): CrossFormUpdateResult => {
  const mapping = getEntityTypeMapping(entityType);

  if (!mapping) {
    console.warn(`⚠️ No mapping found for entity type: ${entityType}`);
    return { SBA_1919: null, SBA_413: null };
  }

  const result: CrossFormUpdateResult = {
    SBA_1919: updateField(applicationId, 'SBA_1919', mapping.SBA_1919, true),
    SBA_413: updateField(applicationId, 'SBA_413', mapping.SBA_413, true)
  };

  console.log(`📝 Updated entity type "${entityType}" in both forms`);

  return result;
};

/**
 * Get complete field data for both forms
 * Returns all field values, progress percentages, and submittable status
 * Used for sending complete PDF field state to frontend
 */
export const getCompleteFieldData = (applicationId: string): {
  SBA_1919: { fields: Record<string, string | boolean>; progress: number; submittable: boolean };
  SBA_413: { fields: Record<string, string | boolean>; progress: number; submittable: boolean };
} | null => {
  const state = stateStore.get(applicationId);
  if (!state) {
    console.warn(`⚠️ No session found for ${applicationId}`);
    return null;
  }

  const progress = calculateProgress(applicationId);
  if (!progress) {
    console.warn(`⚠️ Failed to calculate progress for ${applicationId}`);
    return null;
  }

  // Filter out Mongoose internal fields (like $__parent) from allFields
  const cleanFields = (fields: Record<string, string | boolean>): Record<string, string | boolean> => {
    const cleaned: Record<string, string | boolean> = {};
    for (const [key, value] of Object.entries(fields)) {
      // Skip Mongoose internal fields that start with $
      if (!key.startsWith('$') && !key.startsWith('_doc')) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  };

  return {
    SBA_1919: {
      fields: cleanFields(state.sba1919.allFields),
      progress: progress.SBA_1919,
      submittable: state.sba1919.isSubmittable
    },
    SBA_413: {
      fields: cleanFields(state.sba413.allFields),
      progress: progress.SBA_413,
      submittable: state.sba413.isSubmittable
    }
  };
};

// Export as default object for convenience
export default {
  startSession,
  getState,
  hasSession,
  setCurrentForm,
  updateField,
  skipField,
  getNextField,
  saveSession,
  endSession,
  getStateContext,
  checkSubmissionReadiness,
  getActiveSessions,
  clearAllSessions,
  calculateProgress,
  updateFieldAcrossForms,
  updateEntityTypeAcrossForms,
  getCompleteFieldData
};
