// PDF Form Processing Types

export interface PDFFormField {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature' | 'unknown';
  value?: string | boolean;
  options?: string[]; // For dropdowns and radio buttons
  required?: boolean;
  maxLength?: number;
  description?: string;
}

export interface PDFFormData {
  [fieldName: string]: string | boolean | number;
}

export interface FormFillingRequest {
  templatePath: string;
  data: PDFFormData;
  outputFileName?: string;
  aiAssist?: boolean; // Whether to use AI to map data to fields
  customInstructions?: string;
}

export interface FormFillingResponse {
  success: boolean;
  outputPath?: string;
  fieldsProcessed: number;
  unmappedFields?: string[];
  aiMappings?: { [originalField: string]: string };
  error?: string;
  processingTime: number;
}

export interface FormAnalysisResult {
  totalFields: number;
  fields: PDFFormField[];
  formTitle?: string;
  formDescription?: string;
  estimatedCompletionTime: number;
}