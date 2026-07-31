const { app, BrowserWindow, ipcMain } = require('electron');
app.whenReady().then(() => {
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  win.loadURL(`data:text/html,<html><body><script>
    const fs = require("fs");
    const faceapi = require("@vladmandic/face-api");
    async function run() {
      await faceapi.nets.ssdMobilenetv1.loadFromDisk("C:/Users/vishw/Desktop/photo-sort/resources/models");
      const files = fs.readdirSync("C:/Users/vishw/Downloads/Testfolder");
      let totalFaces = 0;
      for (const f of files) {
        if (!f.toLowerCase().endsWith(".jpg") && !f.toLowerCase().endsWith(".png")) continue;
        const img = new Image();
        img.src = "file://C:/Users/vishw/Downloads/Testfolder/" + f;
        await new Promise(r => img.onload = r);
        const maxDim = 1024;
        let scale = 1;
        if (img.width > maxDim || img.height > maxDim) {
          scale = maxDim / Math.max(img.width, img.height);
        }
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale; canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Test different thresholds
        for (const conf of [0.5, 0.6, 0.7, 0.85]) {
          const detections = await faceapi.detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: conf }));
          console.log(f + " at " + conf + ": " + detections.length + " faces");
          if (conf === 0.5) totalFaces += detections.length;
        }
      }
      console.log("Total faces detected at 0.5: " + totalFaces);
      require("electron").ipcRenderer.send("done");
    }
    run();
  </script></body></html>`);
  win.webContents.on('console-message', (e, level, msg) => console.log(msg));
  ipcMain.on('done', () => app.quit());
});
