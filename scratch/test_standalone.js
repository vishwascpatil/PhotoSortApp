const fs = require('fs');
const initSqlJs = require('c:/Users/vishw/Desktop/photo-sort/node_modules/sql.js');
const path = require('path');

// Test the compiled or standalone logic
const { LANDMARKS, CITIES, lookupCoordinatesOffline } = require('c:/Users/vishw/Desktop/photo-sort/out/main/index.js');
console.log('Lookup test:', lookupCoordinatesOffline?.(27.1719, 78.0421));
