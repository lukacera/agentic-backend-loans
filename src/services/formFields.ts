/**
 * Form Field Definitions for SBA Forms
 *
 * This file defines the fields for SBA Form 1919 and SBA Form 413.
 * Currently using simplified test fields - real fields to be added later.
 */

export interface FormFieldDefinition {
  name: string;
  required: boolean;
  type: 'text' | 'checkbox' | 'number' | 'date';
  label?: string;
}

// ==============================
// SBA FORM 1919 FIELDS
// ==============================

/**
 * SBA Form 1919 - Business Loan Application
 * Real PDF field names from SBAForm1919.pdf
 */
export const SBA_1919_FIELDS: FormFieldDefinition[] = [
  // Basic Business Information (Required)
  { name: 'applicantname', required: true, type: 'text', label: 'Applicant Name' },
  { name: 'operatingnbusname', required: true, type: 'text', label: 'Operating Business Name' },
  { name: 'busTIN', required: true, type: 'text', label: 'Business TIN' },
  { name: 'busphone', required: true, type: 'text', label: 'Business Phone' },
  { name: 'busAddr', required: true, type: 'text', label: 'Business Address' },

  // Basic Business Information (Optional)
  { name: 'yearbeginoperations', required: false, type: 'text', label: 'Year Begin Operations' },
  { name: 'OC', required: false, type: 'text', label: 'OC' },
  { name: 'EPC', required: false, type: 'text', label: 'EPC' },
  { name: 'dba', required: false, type: 'text', label: 'DBA' },
  { name: 'PrimarIndustry', required: false, type: 'text', label: 'Primary Industry' },
  { name: 'UniqueEntityID', required: false, type: 'text', label: 'Unique Entity ID' },
  { name: 'projAddr', required: false, type: 'text', label: 'Project Address' },
  { name: 'pocName', required: false, type: 'text', label: 'POC Name' },
  { name: 'pocEmail', required: false, type: 'text', label: 'POC Email' },

  // Entity Type Checkboxes
  { name: 'soleprop', required: false, type: 'checkbox', label: 'Sole Proprietor' },
  { name: 'partnership', required: false, type: 'checkbox', label: 'Partnership' },
  { name: 'ccorp', required: false, type: 'checkbox', label: 'C-Corp' },
  { name: 'scorp', required: false, type: 'checkbox', label: 'S-Corp' },
  { name: 'llc', required: false, type: 'checkbox', label: 'LLC' },
  { name: 'etother', required: false, type: 'checkbox', label: 'Entity Other' },
  { name: 'entityother', required: false, type: 'text', label: 'Entity Other Description' },

  // Special Ownership Type Checkboxes
  { name: 'ownESOP', required: false, type: 'checkbox', label: 'ESOP' },
  { name: 'own401k', required: false, type: 'checkbox', label: '401k' },
  { name: 'ownCooperative', required: false, type: 'checkbox', label: 'Cooperative' },
  { name: 'ownNATribe', required: false, type: 'checkbox', label: 'Native American Tribe' },
  { name: 'ownOther', required: false, type: 'checkbox', label: 'Ownership Other' },
  { name: 'specOwnTypeOther', required: false, type: 'text', label: 'Special Ownership Type Other' },

  // Employment & Financial Info
  { name: 'existEmp', required: false, type: 'text', label: 'Existing Employees' },
  { name: 'fteJobs', required: false, type: 'text', label: 'FTE Jobs' },
  { name: 'debtAmt', required: false, type: 'text', label: 'Debt Amount' },
  { name: 'purchConstr', required: false, type: 'text', label: 'Purchase/Construction' },
  { name: 'purchAmt', required: false, type: 'text', label: 'Purchase Amount' },

  // Owner 1
  { name: 'ownName1', required: false, type: 'text', label: 'Owner 1 Name' },
  { name: 'ownTitle1', required: false, type: 'text', label: 'Owner 1 Title' },
  { name: 'ownPerc1', required: false, type: 'text', label: 'Owner 1 Percentage' },
  { name: 'ownTin1', required: false, type: 'text', label: 'Owner 1 TIN' },
  { name: 'ownHome1', required: false, type: 'text', label: 'Owner 1 Home Address' },

  // Owner 2
  { name: 'ownName2', required: false, type: 'text', label: 'Owner 2 Name' },
  { name: 'ownTitle2', required: false, type: 'text', label: 'Owner 2 Title' },
  { name: 'ownPerc2', required: false, type: 'text', label: 'Owner 2 Percentage' },
  { name: 'ownTin2', required: false, type: 'text', label: 'Owner 2 TIN' },
  { name: 'ownHome2', required: false, type: 'text', label: 'Owner 2 Home Address' },

  // Owner 3
  { name: 'ownName3', required: false, type: 'text', label: 'Owner 3 Name' },
  { name: 'ownTitle3', required: false, type: 'text', label: 'Owner 3 Title' },
  { name: 'ownPerc3', required: false, type: 'text', label: 'Owner 3 Percentage' },
  { name: 'ownTin3', required: false, type: 'text', label: 'Owner 3 TIN' },
  { name: 'ownHome3', required: false, type: 'text', label: 'Owner 3 Home Address' },

  // Owner 4
  { name: 'ownName4', required: false, type: 'text', label: 'Owner 4 Name' },
  { name: 'ownTitle4', required: false, type: 'text', label: 'Owner 4 Title' },
  { name: 'ownPerc4', required: false, type: 'text', label: 'Owner 4 Percentage' },
  { name: 'ownTin4', required: false, type: 'text', label: 'Owner 4 TIN' },
  { name: 'ownHome4', required: false, type: 'text', label: 'Owner 4 Home Address' },

  // Owner 5
  { name: 'ownName5', required: false, type: 'text', label: 'Owner 5 Name' },
  { name: 'ownTitle5', required: false, type: 'text', label: 'Owner 5 Title' },
  { name: 'ownPerc5', required: false, type: 'text', label: 'Owner 5 Percentage' },
  { name: 'ownTin5', required: false, type: 'text', label: 'Owner 5 TIN' },
  { name: 'ownHome5', required: false, type: 'text', label: 'Owner 5 Home Address' },
  { name: 'ownPos', required: false, type: 'text', label: 'Owner Position' },

  // Veteran Status Checkboxes
  { name: 'statNonVet', required: false, type: 'checkbox', label: 'Non-Veteran' },
  { name: 'statVet', required: false, type: 'checkbox', label: 'Veteran' },
  { name: 'statVetD', required: false, type: 'checkbox', label: 'Veteran with Disability' },
  { name: 'statVetSp', required: false, type: 'checkbox', label: 'Service-Disabled Veteran' },
  { name: 'statND', required: false, type: 'checkbox', label: 'Status Not Disclosed' },

  // Gender Checkboxes
  { name: 'male', required: false, type: 'checkbox', label: 'Male' },
  { name: 'female', required: false, type: 'checkbox', label: 'Female' },

  // Race Checkboxes
  { name: 'raceAIAN', required: false, type: 'checkbox', label: 'American Indian or Alaska Native' },
  { name: 'raceAsian', required: false, type: 'checkbox', label: 'Asian' },
  { name: 'raceBAA', required: false, type: 'checkbox', label: 'Black or African American' },
  { name: 'raceNHPI', required: false, type: 'checkbox', label: 'Native Hawaiian or Pacific Islander' },
  { name: 'raceWhite', required: false, type: 'checkbox', label: 'White' },
  { name: 'raceND', required: false, type: 'checkbox', label: 'Race Not Disclosed' },

  // Ethnicity Checkboxes
  { name: 'ethHisp', required: false, type: 'checkbox', label: 'Hispanic or Latino' },
  { name: 'ethNot', required: false, type: 'checkbox', label: 'Not Hispanic or Latino' },
  { name: 'ethND', required: false, type: 'checkbox', label: 'Ethnicity Not Disclosed' },

  // Questions (Yes/No Checkboxes)
  { name: 'q1Yes', required: false, type: 'checkbox', label: 'Question 1 Yes' },
  { name: 'q1No', required: false, type: 'checkbox', label: 'Question 1 No' },
  { name: 'q2Yes', required: false, type: 'checkbox', label: 'Question 2 Yes' },
  { name: 'q2No', required: false, type: 'checkbox', label: 'Question 2 No' },
  { name: 'q3Yes', required: false, type: 'checkbox', label: 'Question 3 Yes' },
  { name: 'q3No', required: false, type: 'checkbox', label: 'Question 3 No' },
  { name: 'q4Yes', required: false, type: 'checkbox', label: 'Question 4 Yes' },
  { name: 'q4No', required: false, type: 'checkbox', label: 'Question 4 No' },
  { name: 'q5Yes', required: false, type: 'checkbox', label: 'Question 5 Yes' },
  { name: 'q5No', required: false, type: 'checkbox', label: 'Question 5 No' },
  { name: 'q6Yes', required: false, type: 'checkbox', label: 'Question 6 Yes' },
  { name: 'q6No', required: false, type: 'checkbox', label: 'Question 6 No' },
  { name: 'q7Yes', required: false, type: 'checkbox', label: 'Question 7 Yes' },
  { name: 'q7No', required: false, type: 'checkbox', label: 'Question 7 No' },
  { name: 'q8Yes', required: false, type: 'checkbox', label: 'Question 8 Yes' },
  { name: 'q8No', required: false, type: 'checkbox', label: 'Question 8 No' },
  { name: 'q9Yes', required: false, type: 'checkbox', label: 'Question 9 Yes' },
  { name: 'q9No', required: false, type: 'checkbox', label: 'Question 9 No' },
  { name: 'q10Yes', required: false, type: 'checkbox', label: 'Question 10 Yes' },
  { name: 'q10No', required: false, type: 'checkbox', label: 'Question 10 No' },

  // Purpose/Use of Proceeds
  { name: 'EquipAmt', required: false, type: 'text', label: 'Equipment Amount' },
  { name: 'purpEquip', required: false, type: 'text', label: 'Purpose Equipment' },
  { name: 'workCap', required: false, type: 'text', label: 'Working Capital' },
  { name: 'busAcq', required: false, type: 'text', label: 'Business Acquisition' },
  { name: 'purpOther1', required: false, type: 'text', label: 'Purpose Other 1' },
  { name: 'purpOther2', required: false, type: 'text', label: 'Purpose Other 2' },
  { name: 'purpInv', required: false, type: 'text', label: 'Purpose Inventory' },
  { name: 'debtRef', required: false, type: 'text', label: 'Debt Refinance' }
];

/**
 * Required field names for SBA Form 1919
 */
export const SBA_1919_REQUIRED: string[] = SBA_1919_FIELDS
  .filter(f => f.required)
  .map(f => f.name);

/**
 * All field names for SBA Form 1919
 */
export const SBA_1919_FIELD_NAMES: string[] = SBA_1919_FIELDS.map(f => f.name);

// ==============================
// SBA FORM 413 FIELDS
// ==============================

/**
 * SBA Form 413 - Personal Financial Statement
 * Simplified test fields - real fields to be added later
 */
export const SBA_413_FIELDS: FormFieldDefinition[] = [
  { name: 'applicantName', required: true, type: 'text', label: 'Applicant Name' },
  { name: 'businessName', required: true, type: 'text', label: 'Business Name' }
];

/**
 * Required field names for SBA Form 413
 */
export const SBA_413_REQUIRED: string[] = SBA_413_FIELDS
  .filter(f => f.required)
  .map(f => f.name);

/**
 * All field names for SBA Form 413
 */
export const SBA_413_FIELD_NAMES: string[] = SBA_413_FIELDS.map(f => f.name);

// ==============================
// HELPER FUNCTIONS
// ==============================

/**
 * Get field definitions for a specific form type
 */
export const getFieldsForForm = (formType: 'SBA_1919' | 'SBA_413'): FormFieldDefinition[] => {
  return formType === 'SBA_1919' ? SBA_1919_FIELDS : SBA_413_FIELDS;
};

/**
 * Get required field names for a specific form type
 */
export const getRequiredFieldsForForm = (formType: 'SBA_1919' | 'SBA_413'): string[] => {
  return formType === 'SBA_1919' ? SBA_1919_REQUIRED : SBA_413_REQUIRED;
};

/**
 * Get all field names for a specific form type
 */
export const getFieldNamesForForm = (formType: 'SBA_1919' | 'SBA_413'): string[] => {
  return formType === 'SBA_1919' ? SBA_1919_FIELD_NAMES : SBA_413_FIELD_NAMES;
};

/**
 * Create an empty fields object for a form
 * Text fields default to '', checkbox fields default to false
 */
export const createEmptyFieldsObject = (formType: 'SBA_1919' | 'SBA_413'): Record<string, string | boolean> => {
  const fields = getFieldsForForm(formType);
  return fields.reduce((acc, field) => {
    acc[field.name] = field.type === 'checkbox' ? false : '';
    return acc;
  }, {} as Record<string, string | boolean>);
};

/**
 * Get field label by name
 */
export const getFieldLabel = (formType: 'SBA_1919' | 'SBA_413', fieldName: string): string => {
  const fields = getFieldsForForm(formType);
  const field = fields.find(f => f.name === fieldName);
  return field?.label || fieldName;
};

/**
 * Check if a field is required
 */
export const isFieldRequired = (formType: 'SBA_1919' | 'SBA_413', fieldName: string): boolean => {
  const required = getRequiredFieldsForForm(formType);
  return required.includes(fieldName);
};
