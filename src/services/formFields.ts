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
 * Complete field definitions matching Sba413FieldsSchema in Application.ts
 */
export const SBA_413_FIELDS: FormFieldDefinition[] = [
  // Program Selection (checkboxes)
  { name: 'disasterBusinessLoanApplication', required: false, type: 'checkbox', label: 'Disaster Business Loan' },
  { name: 'womenOwnedSmallBusiness', required: false, type: 'checkbox', label: 'WOSB' },
  { name: 'businessDevelopmentProgram8a', required: false, type: 'checkbox', label: '8(a) Program' },
  { name: 'loan7aOr504OrSuretyBonds', required: false, type: 'checkbox', label: '7(a)/504/Surety' },

  // Personal Information
  { name: 'name', required: true, type: 'text', label: 'Name' },
  { name: 'businessPhone', required: false, type: 'text', label: 'Business Phone' },
  { name: 'homeAddress', required: false, type: 'text', label: 'Home Address' },
  { name: 'homePhone', required: false, type: 'text', label: 'Home Phone' },
  { name: 'cityStateZipCode', required: false, type: 'text', label: 'City, State, ZIP' },
  { name: 'businessNameOfApplicantBorrower', required: true, type: 'text', label: 'Business Name' },
  { name: 'businessAddress', required: false, type: 'text', label: 'Business Address' },

  // Business Type (checkboxes)
  { name: 'businessTypeCorporation', required: false, type: 'checkbox', label: 'Corporation' },
  { name: 'businessTypeSCorp', required: false, type: 'checkbox', label: 'S-Corp' },
  { name: 'businessTypeLLC', required: false, type: 'checkbox', label: 'LLC' },
  { name: 'businessTypePartnership', required: false, type: 'checkbox', label: 'Partnership' },
  { name: 'businessTypeSoleProprietor', required: false, type: 'checkbox', label: 'Sole Proprietor' },

  // Date and Marital Status
  { name: 'informationCurrentAsOf', required: false, type: 'text', label: 'Information Current As Of' },
  { name: 'wosbApplicantMarriedYes', required: false, type: 'checkbox', label: 'WOSB Married Yes' },
  { name: 'wosbApplicantMarriedNo', required: false, type: 'checkbox', label: 'WOSB Married No' },

  // Assets
  { name: 'cashOnHandAndInBanks', required: false, type: 'text', label: 'Cash on Hand' },
  { name: 'savingsAccounts', required: false, type: 'text', label: 'Savings Accounts' },
  { name: 'iraOrOtherRetirementAccount', required: false, type: 'text', label: 'IRA/Retirement' },
  { name: 'accountsAndNotesReceivable', required: false, type: 'text', label: 'Accounts Receivable' },
  { name: 'lifeInsuranceCashSurrenderValueOnly', required: false, type: 'text', label: 'Life Insurance CSV' },
  { name: 'stocksAndBonds', required: false, type: 'text', label: 'Stocks and Bonds' },
  { name: 'realEstate', required: false, type: 'text', label: 'Real Estate' },
  { name: 'automobiles', required: false, type: 'text', label: 'Automobiles' },
  { name: 'otherPersonalProperty', required: false, type: 'text', label: 'Other Personal Property' },
  { name: 'otherAssets', required: false, type: 'text', label: 'Other Assets' },
  { name: 'totalAssets', required: false, type: 'text', label: 'Total Assets' },

  // Liabilities
  { name: 'accountsPayable', required: false, type: 'text', label: 'Accounts Payable' },
  { name: 'notesPayableToBanksAndOthers', required: false, type: 'text', label: 'Notes Payable' },
  { name: 'installmentAccountAuto', required: false, type: 'text', label: 'Auto Installment' },
  { name: 'installmentAccountMonthlyPaymentsAuto', required: false, type: 'text', label: 'Auto Monthly Payment' },
  { name: 'installmentAccountOther', required: false, type: 'text', label: 'Other Installment' },
  { name: 'installmentAccountMonthlyPaymentsOther', required: false, type: 'text', label: 'Other Monthly Payment' },
  { name: 'loansAgainstLifeInsurance', required: false, type: 'text', label: 'Loans Against Life Insurance' },
  { name: 'mortgagesOnRealEstate', required: false, type: 'text', label: 'Mortgages' },
  { name: 'unpaidTaxes', required: false, type: 'text', label: 'Unpaid Taxes' },
  { name: 'otherLiabilities', required: false, type: 'text', label: 'Other Liabilities' },
  { name: 'totalLiabilities', required: false, type: 'text', label: 'Total Liabilities' },
  { name: 'netWorth', required: false, type: 'text', label: 'Net Worth' },

  // Income
  { name: 'salary', required: false, type: 'text', label: 'Salary' },
  { name: 'netInvestmentIncome', required: false, type: 'text', label: 'Net Investment Income' },
  { name: 'realEstateIncome', required: false, type: 'text', label: 'Real Estate Income' },
  { name: 'otherIncome', required: false, type: 'text', label: 'Other Income' },

  // Contingent Liabilities
  { name: 'asEndorserOrCoMaker', required: false, type: 'text', label: 'As Endorser/Co-Maker' },
  { name: 'legalClaimsAndJudgements', required: false, type: 'text', label: 'Legal Claims' },
  { name: 'provisionForFederalIncomeTax', required: false, type: 'text', label: 'Federal Tax Provision' },
  { name: 'otherSpecialDebt', required: false, type: 'text', label: 'Other Special Debt' },

  // Sections
  { name: 'descriptionOfOtherIncomeRow1', required: false, type: 'text', label: 'Other Income Description' },
  { name: 'section5OtherPersonalPropertyAndAssets', required: false, type: 'text', label: 'Section 5' },
  { name: 'section6UnpaidTaxes', required: false, type: 'text', label: 'Section 6' },
  { name: 'section7OtherLiabilities', required: false, type: 'text', label: 'Section 7' },
  { name: 'section8LifeInsuranceHeld', required: false, type: 'text', label: 'Section 8' },

  // Signatures
  { name: 'signature', required: false, type: 'text', label: 'Signature' },
  { name: 'date', required: false, type: 'text', label: 'Date' },
  { name: 'printName', required: false, type: 'text', label: 'Print Name' },
  { name: 'socialSecurityNo', required: false, type: 'text', label: 'SSN' },
  { name: 'signature2', required: false, type: 'text', label: 'Signature 2' },
  { name: 'date2', required: false, type: 'text', label: 'Date 2' },
  { name: 'printName2', required: false, type: 'text', label: 'Print Name 2' },
  { name: 'socialSecurityNo2', required: false, type: 'text', label: 'SSN 2' }
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
