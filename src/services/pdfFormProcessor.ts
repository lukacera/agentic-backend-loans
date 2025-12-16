import * as fs from 'fs-extra';
import * as path from 'path';
import { PDFDocument, PDFForm, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib';
import { 
  PDFFormField, 
  PDFFormData, 
  FormFillingResponse,
  FormAnalysisResult 
} from '../types';

// Initialize directories
const TEMPLATES_DIR = path.join(process.cwd(), 'templates');
const GENERATED_DIR = path.join(process.cwd(), 'generated');

export const initializePDFDirectories = async (): Promise<void> => {
  await fs.ensureDir(TEMPLATES_DIR);
  await fs.ensureDir(GENERATED_DIR);
};

// Extract form fields from PDF
export const extractFormFields = async (pdfPath: string): Promise<FormAnalysisResult> => {
  try {
    const pdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fieldNames = form.getFields().map(field => field.getName());
    
    const fields: PDFFormField[] = [];
    
    for (const fieldName of fieldNames) {
      try {
        const field = form.getField(fieldName);
        const fieldType = getFieldType(field);
        
        const formField: PDFFormField = {
          name: fieldName,
          type: fieldType,
          required: false, // PDF-lib doesn't expose required info easily
          description: fieldName // Use field name as description for now
        };

        // Get additional info based on field type
        if (fieldType === 'text') {
          const textField = field as PDFTextField;
          formField.maxLength = textField.getMaxLength() || undefined;
        } else if (fieldType === 'dropdown') {
          const dropdown = field as PDFDropdown;
          formField.options = dropdown.getOptions();
        } else if (fieldType === 'radio') {
          const radioGroup = field as PDFRadioGroup;
          formField.options = radioGroup.getOptions();
        }

        fields.push(formField);
      } catch (fieldError) {
        console.warn(`Could not process field ${fieldName}:`, fieldError);
        // Add as unknown field
        fields.push({
          name: fieldName,
          type: 'unknown',
          description: fieldName
        });
      }
    }

    return {
      totalFields: fields.length,
      fields,
      formTitle: path.basename(pdfPath, '.pdf'),
      formDescription: `PDF form with ${fields.length} fields`,
      estimatedCompletionTime: fields.length * 2 // 2 seconds per field estimate
    };

  } catch (error) {
    console.error('Error extracting form fields:', error);
    throw new Error(`Failed to extract form fields: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// Get field type helper
const getFieldType = (field: any): PDFFormField['type'] => {
  const constructor = field.constructor.name;
  
  switch (constructor) {
    case 'PDFTextField':
      return 'text';
    case 'PDFCheckBox':
      return 'checkbox';
    case 'PDFRadioGroup':
      return 'radio';
    case 'PDFDropdown':
      return 'dropdown';
    case 'PDFSignature':
      return 'signature';
    default:
      return 'unknown';
  }
};

// Fill PDF form with data
export const fillPDFForm = async (
  templatePath: string,
  data: PDFFormData,
  outputFileName?: string
): Promise<FormFillingResponse> => {
  const startTime = Date.now();
  
  try {
    // Load the PDF
    const pdfBytes = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    
    let fieldsProcessed = 0;
    const unmappedFields: string[] = [];
    
    // Get all available fields
    const formFields = form.getFields();
    const availableFieldNames = formFields.map(f => f.getName());
    // Fill fields with provided data
    for (const [fieldName, value] of Object.entries(data)) {
      try {
        if (availableFieldNames.includes(fieldName)) {
          const field = form.getField(fieldName);
          
          // Fill based on field type
          if (field.constructor.name === 'PDFTextField') {
            const textField = field as PDFTextField;
            textField.setText(String(value));
            fieldsProcessed++;
          } else if (field.constructor.name === 'PDFCheckBox') {
            const checkbox = field as PDFCheckBox;
            if (typeof value === 'boolean') {
              if (value) checkbox.check();
              else checkbox.uncheck();
            } else {
              // Handle string values like "yes", "true", "1"
              const boolValue = ['yes', 'true', '1', 'on', 'checked'].includes(String(value).toLowerCase());
              if (boolValue) checkbox.check();
              else checkbox.uncheck();
            }
            fieldsProcessed++;
          } else if (field.constructor.name === 'PDFDropdown') {
            const dropdown = field as PDFDropdown;
            dropdown.select(String(value));
            fieldsProcessed++;
          } else if (field.constructor.name === 'PDFRadioGroup') {
            const radioGroup = field as PDFRadioGroup;
            radioGroup.select(String(value));
            fieldsProcessed++;
          } else {
            console.warn(`Unsupported field type for ${fieldName}: ${field.constructor.name}`);
            unmappedFields.push(fieldName);
          }
        } else {
          console.warn(`Field ${fieldName} not found in PDF form`);
          unmappedFields.push(fieldName);
        }
      } catch (fieldError) {
        console.error(`Error filling field ${fieldName}:`, fieldError);
        unmappedFields.push(fieldName);
      }
    }
    
    // Generate output filename
    const outputName = outputFileName || `filled_${Date.now()}_${path.basename(templatePath)}`;
    const outputPath = path.join(GENERATED_DIR, outputName);
    
    // Save filled PDF
    const filledPdfBytes = await pdfDoc.save();
    await fs.writeFile(outputPath, filledPdfBytes);
    
    const processingTime = Date.now() - startTime;
    
    return {
      success: true,
      outputPath,
      fieldsProcessed,
      unmappedFields: unmappedFields.length > 0 ? unmappedFields : undefined,
      processingTime
    };
    
  } catch (error) {
    console.error('Error filling PDF form:', error);
    return {
      success: false,
      fieldsProcessed: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      processingTime: Date.now() - startTime
    };
  }
};

// AI-assisted field mapping
export const mapDataWithAI = async (
  formFields: PDFFormField[],
  userData: Record<string, any>,
  agentState: any,
  customInstructions?: string
): Promise<PDFFormData> => {
  try {
    const fieldNames = formFields.map(f => f.name).join(', ');
    const userDataSample = JSON.stringify(userData, null, 2);
    console.log("userDataSample:", userDataSample);
    // System prompt - the instructions for the AI
    const systemPrompt = `You are a form-filling expert. Your task is to intelligently map user data to PDF form fields.
    Rules:
    - Return ONLY a valid JSON object, no explanation or markdown
    - Keys must be exact PDF field names from the provided list
    - Values should be the corresponding data from user input
    - Use intelligent mapping (e.g., "firstName" maps to "First Name" or "first_name")
    - For checkboxes, use boolean true/false
    - For missing data, omit the field from the response
    - Split combined fields intelligently (e.g., "fullName" can map to separate "Name" or "First Name"/"Last Name" fields)

    ${customInstructions ? `Additional instructions: ${customInstructions}` : ''}`;

      // User input - the actual data to process
      const userInput = `PDF Form Fields: ${fieldNames}

    User Data to Map:
    {${userDataSample}}

    Please provide the mapping as a JSON object.`;

    const response = await processWithLLM(agentState, systemPrompt, userInput);
    
    try {
      // Clean up response in case LLM adds markdown code blocks
      let cleanedResponse = response.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```\n?/g, '');
      }
      
      return JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse AI mapping response:', response);
      console.log('Falling back to simple field mapping...');
      return simpleFieldMapping(formFields, userData);
    }
    
  } catch (error) {
    console.error('AI mapping failed:', error);
    return simpleFieldMapping(formFields, userData);
  }
};

// Simple field mapping fallback
const simpleFieldMapping = (formFields: PDFFormField[], userData: Record<string, any>): PDFFormData => {
  const mappedData: PDFFormData = {};
  
  for (const field of formFields) {
    const fieldName = field.name.toLowerCase();
    
    // Try exact match first
    if (userData[field.name]) {
      mappedData[field.name] = userData[field.name];
      continue;
    }
    
    // Try case-insensitive match
    for (const [key, value] of Object.entries(userData)) {
      if (key.toLowerCase() === fieldName) {
        mappedData[field.name] = value;
        break;
      }
    }
    
    // Try partial matches for common fields
    if (!mappedData[field.name]) {
      const commonMappings = {
        'first': ['firstName', 'first_name', 'fname'],
        'last': ['lastName', 'last_name', 'lname'],
        'email': ['emailAddress', 'email_address', 'mail'],
        'phone': ['phoneNumber', 'phone_number', 'telephone', 'tel'],
        'address': ['streetAddress', 'street_address', 'addr'],
        'city': ['cityName', 'city_name'],
        'state': ['stateName', 'state_name'],
        'zip': ['zipCode', 'zip_code', 'postal', 'postalCode']
      };
      
      for (const [pattern, variants] of Object.entries(commonMappings)) {
        if (fieldName.includes(pattern)) {
          for (const variant of variants) {
            if (userData[variant]) {
              mappedData[field.name] = userData[variant];
              break;
            }
          }
          if (mappedData[field.name]) break;
        }
      }
    }
  }
  
  return mappedData;
};

// Import processWithLLM from BaseAgent
import { processWithLLM } from '../agents/BaseAgent.js';

// Extract form field values from PDF buffer (for reading filled fields)
export const extractFormFieldValues = async (
  pdfBuffer: Buffer
): Promise<{
  filledFields: string[];
  emptyFields: string[];
  allFields: Record<string, any>;
}> => {
  try {
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    const filledFields: string[] = [];
    const emptyFields: string[] = [];
    const allFields: Record<string, any> = {};

    for (const field of fields) {
      const fieldName = field.getName();
      const fieldType = field.constructor.name;

      // Only process text fields
      if (fieldType !== 'PDFTextField' && fieldType !== 'PDFTextField2') {
        continue;
      }

      try {
        const textField = field as PDFTextField;
        const value = textField.getText();

        allFields[fieldName] = value;

        // Determine if field is filled or empty
        const isFilled = value !== null && value !== undefined && value !== '';
        if (isFilled) {
          filledFields.push(fieldName);
        } else {
          emptyFields.push(fieldName);
        }
      } catch (fieldError) {
        console.warn(`Could not read value from field ${fieldName}:`, fieldError);
        allFields[fieldName] = null;
        emptyFields.push(fieldName);
      }
    }

    return {
      filledFields,
      emptyFields,
      allFields
    };
  } catch (error) {
    console.error('Error extracting form field values:', error);
    throw new Error(`Failed to extract form field values: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};