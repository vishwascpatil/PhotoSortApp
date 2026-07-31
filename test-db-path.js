const { app } = require('electron'); app.whenReady().then(() => { console.log(app.getPath('userData')); app.quit(); });
