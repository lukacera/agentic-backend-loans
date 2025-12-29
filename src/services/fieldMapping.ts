/**
 * Cross-form field mapping for unified data capture
 * Maps a unified question to fields in both SBA forms (1919 and 413)
 */

// ==============================
// TYPES
// ==============================

export interface FieldMapping {
  unifiedName: string;           // Internal name for the unified field
  question: string;              // Question to ask user
  SBA_1919: string | null;       // Field name in Form 1919 (null if not applicable)
  SBA_413: string | null;        // Field name in Form 413 (null if not applicable)
}

// ==============================
// UNIFIED FIELD MAPPINGS
// ==============================

/**
 * Shared fields that exist in both forms
 * When user answers these questions, BOTH forms get updated
 */
export const UNIFIED_FIELDS: FieldMapping[] = [
  // Personal/Applicant Info
  {
    unifiedName: 'applicantName',
    question: "What's your full name?",
    SBA_1919: 'applicantname',
    SBA_413: 'name'
  },
  {
    unifiedName: 'businessName',
    question: "What's your business name?",
    SBA_1919: 'operatingnbusname',
    SBA_413: 'businessNameOfApplicantBorrower'
  },
  {
    unifiedName: 'businessPhone',
    question: "What's your business phone number?",
    SBA_1919: 'busphone',
    SBA_413: 'businessPhone'
  },
  {
    unifiedName: 'businessAddress',
    question: "What's your business address?",
    SBA_1919: 'busAddr',
    SBA_413: 'businessAddress'
  },
  {
    unifiedName: 'homeAddress',
    question: "What's your home address?",
    SBA_1919: 'ownHome1',
    SBA_413: 'homeAddress'
  },
  {
    unifiedName: 'ownerSSN',
    question: "What's your Social Security Number?",
    SBA_1919: 'ownTin1',
    SBA_413: 'socialSecurityNo'
  },
  {
    unifiedName: 'printName',
    question: "What name should be printed on the signature line?",
    SBA_1919: 'ownName1',
    SBA_413: 'printName'
  },
  {
    unifiedName: 'signatureDate',
    question: "What's today's date for the signature?",
    SBA_1919: null,  // 1919 has different date field
    SBA_413: 'date'
  }
];

// ==============================
// ENTITY TYPE MAPPING
// ==============================

/**
 * Entity type checkbox mapping (exclusive - only one can be selected)
 * Maps user-friendly entity names to checkbox field names in both forms
 */
export const ENTITY_TYPE_MAPPING: Record<string, { SBA_1919: string; SBA_413: string }> = {
  'Sole Proprietor': { SBA_1919: 'soleprop', SBA_413: 'businessTypeSoleProprietor' },
  'Partnership': { SBA_1919: 'partnership', SBA_413: 'businessTypePartnership' },
  'C-Corp': { SBA_1919: 'ccorp', SBA_413: 'businessTypeCorporation' },
  'S-Corp': { SBA_1919: 'scorp', SBA_413: 'businessTypeSCorp' },
  'LLC': { SBA_1919: 'llc', SBA_413: 'businessTypeLLC' }
};

// ==============================
// HELPER FUNCTIONS
// ==============================

/**
 * Get field mapping by unified name
 */
export const getFieldMapping = (unifiedName: string): FieldMapping | undefined => {
  return UNIFIED_FIELDS.find(f => f.unifiedName === unifiedName);
};

/**
 * Check if a field name belongs to a unified field
 */
export const isUnifiedField = (fieldName: string, formType: 'SBA_1919' | 'SBA_413'): FieldMapping | undefined => {
  return UNIFIED_FIELDS.find(f =>
    (formType === 'SBA_1919' && f.SBA_1919 === fieldName) ||
    (formType === 'SBA_413' && f.SBA_413 === fieldName)
  );
};

/**
 * Get entity type mapping by user-friendly name
 */
export const getEntityTypeMapping = (entityType: string): { SBA_1919: string; SBA_413: string } | undefined => {
  return ENTITY_TYPE_MAPPING[entityType];
};

/**
 * Get all unified field names
 */
export const getUnifiedFieldNames = (): string[] => {
  return UNIFIED_FIELDS.map(f => f.unifiedName);
};

/**
 * Get all entity type options
 */
export const getEntityTypeOptions = (): string[] => {
  return Object.keys(ENTITY_TYPE_MAPPING);
};
