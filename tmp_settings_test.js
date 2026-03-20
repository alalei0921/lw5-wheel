const { chromium } = require('playwright');
const { spawn } = require('child_process');

(async () => {
  const server = spawn('python3', ['-m', 'http.server', '8787'], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const dialogs = [];
  page.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });

  try {
    await page.goto('http://127.0.0.1:8787/stock/index.html', { waitUntil: 'load' });
    await page.evaluate(() => localStorage.removeItem('inventory'));
    await page.reload({ waitUntil: 'load' });

    // 1) 消耗设置：调整仅本地保存
    await page.getByRole('button', { name: '消耗设置' }).click();
    const before = await page.inputValue('#days-0');
    await page.fill('#days-0', '777');
    await page.getByRole('button', { name: '调整' }).first().click();
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('button', { name: '消耗设置' }).click();
    const afterLocal = await page.inputValue('#days-0');

    // 2) 消耗设置云上传 + 云下载
    const uploadBtns = page.getByRole('button', { name: '☁️ 云上传' });
    const downloadBtns = page.getByRole('button', { name: '☁️ 云下载' });
    const uploadCount = await uploadBtns.count();
    const downloadCount = await downloadBtns.count();

    // 取 settings 页的按钮（最后一组）
    const settingsUpload = uploadBtns.nth(uploadCount - 1);
    const settingsDownload = downloadBtns.nth(downloadCount - 1);

    await settingsUpload.click();
    await page.waitForTimeout(1500);

    await page.fill('#days-0', '333');
    await page.getByRole('button', { name: '调整' }).first().click();
    await settingsDownload.click();
    await page.waitForTimeout(1500);
    const afterCloudDownload = await page.inputValue('#days-0');

    // 3) 检查“云下载按钮是否可点”
    const isDownloadDisabled = await settingsDownload.isDisabled();

    const result = {
      before,
      afterLocal,
      afterCloudDownload,
      uploadCount,
      downloadCount,
      isDownloadDisabled,
      dialogs
    };
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})();
