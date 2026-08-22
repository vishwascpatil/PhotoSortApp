import { Photo } from '../contexts/PhotoContext'

export interface DocumentInfo {
  isDocument: boolean
  category: string
  confidence: number
  matchedReason: string
}

const DOCUMENT_KEYWORDS: Record<string, string[]> = {
  'Government & Identity': [
    'aadhaar', 'aadhar', 'adhar', 'adhaar', 'uidai',
    'pan', 'pancard', 'pan_card', 'income_tax',
    'passport', 'voter', 'epic', 'election',
    'driving', 'licence', 'license', 'dl_no', 'rto',
    'ration', 'id_card', 'idcard', 'identity_card', 'identity',
    'caste', 'domicile', 'birth_cert', 'death_cert'
  ],
  'Banking & Finance': [
    'bank', 'statement', 'passbook', 'cheque', 'check',
    'deposit', 'withdrawal', 'tax', 'itr', 'form16', 'form_16',
    'credit_card', 'loan', 'emi', 'insurance', 'policy', 'mutual_fund'
  ],
  'Utility Bills': [
    'bill', 'receipt', 'electricity', 'bescom', 'tneb', 'mseb',
    'water', 'gas', 'lpg', 'indane', 'hp_gas', 'bharat_gas',
    'broadband', 'wifi', 'internet', 'airtel', 'jio', 'vi', 'bsnl',
    'telephone', 'mobile_bill', 'utility'
  ],
  'Business & Invoices': [
    'invoice', 'inv_', 'tax_invoice', 'purchase_order', 'po_',
    'quotation', 'estimate', 'challan', 'delivery_note',
    'gst', 'gstin', 'bill_of_supply', 'sales_receipt', 'cash_memo'
  ],
  'Medical': [
    'prescription', 'rx', 'doctor', 'hospital', 'clinic',
    'lab_report', 'blood_test', 'mri', 'xray', 'x_ray', 'ct_scan',
    'discharge_summary', 'diagnosis', 'vaccine', 'vaccination'
  ],
  'Education & Career': [
    'marksheet', 'grade_sheet', 'transcript', 'degree', 'diploma',
    'certificate', 'admit_card', 'hall_ticket', 'resume', 'cv',
    'offer_letter', 'payslip', 'salary_slip', 'experience_letter',
    'relieving_letter', 'internship', 'recommendation'
  ],
  'Legal & Property': [
    'agreement', 'lease', 'rent_agreement', 'sale_deed', 'deed',
    'property_tax', 'khata', 'registry', 'affidavit', 'notary',
    'power_of_attorney', 'stamp_paper', 'bond', 'court_order'
  ]
}

export function detectLocalDocument(photo: Photo): DocumentInfo {
  // 1. If already classified by backend OCR / database
  if (photo.is_document === 1) {
    return {
      isDocument: true,
      category: photo.document_category || 'General Document',
      confidence: 95,
      matchedReason: `Verified Document (${photo.document_category || 'OCR Classified'})`
    }
  }

  // 2. MIME type check (PDFs, text files, word docs)
  const mime = (photo.mime_type || '').toLowerCase()
  if (mime.includes('pdf') || mime.includes('text') || mime.includes('document') || mime.includes('word') || mime.includes('sheet')) {
    return {
      isDocument: true,
      category: 'General Document',
      confidence: 90,
      matchedReason: `Document file type (${photo.mime_type})`
    }
  }

  const filename = (photo.filename || '').toLowerCase()
  const filePath = (photo.file_path || '').toLowerCase()
  const extractedText = (photo.extracted_text || '').toLowerCase()

  // 3. Keyword matching against categories (in filename, path, or extracted OCR text)
  for (const [category, keywords] of Object.entries(DOCUMENT_KEYWORDS)) {
    for (const kw of keywords) {
      if (filename.includes(kw) || filePath.includes(`/${kw}`) || filePath.includes(`\\${kw}`) || (extractedText && extractedText.includes(kw))) {
        return {
          isDocument: true,
          category,
          confidence: 85,
          matchedReason: `Matched keyword: "${kw}" in ${category}`
        }
      }
    }
  }

  // 4. General document indicator keywords
  const generalKeywords = ['doc_', 'doc-', 'scan_', 'scan-', 'document', 'receipt', 'invoice', 'statement', 'certificate', 'form', 'letter', 'slip', 'report']
  for (const kw of generalKeywords) {
    if (filename.includes(kw) || filePath.includes(kw)) {
      return {
        isDocument: true,
        category: 'General Document',
        confidence: 75,
        matchedReason: `Matched document filename pattern "${kw}"`
      }
    }
  }

  // 5. Check if aspect ratio matches standard documents without camera EXIF
  if (photo.width && photo.height) {
    const ratio = photo.width > photo.height ? photo.width / photo.height : photo.height / photo.width
    const isA4Ratio = ratio >= 1.38 && ratio <= 1.45 // A4 ratio 1.414
    const isIdRatio = ratio >= 1.54 && ratio <= 1.62 // ID-1 ratio 1.586

    // If matches A4 or ID card aspect ratio and camera make/model is missing
    if ((isA4Ratio || isIdRatio) && !photo.camera_make && !photo.camera_model && photo.width >= 600) {
      return {
        isDocument: true,
        category: isIdRatio ? 'Government & Identity' : 'General Document',
        confidence: 60,
        matchedReason: `Standard document aspect ratio (${ratio.toFixed(2)})`
      }
    }
  }

  return {
    isDocument: false,
    category: 'Non-Document',
    confidence: 0,
    matchedReason: ''
  }
}
