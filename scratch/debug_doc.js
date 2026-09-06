const fs = require('fs')
const path = require('path')
const os = require('os')
const initSqlJs = require('sql.js')

// Load the actual compiled or source document detector
// Or import classifyExtractedText directly
const { classifyExtractedText, checkIdentitySignatures, detectMemeOrSocialSignals } = require('../src/main/services/document/documentDetector.ts')
