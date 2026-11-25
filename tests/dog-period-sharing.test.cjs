const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright');

const script = path.resolve(__dirname, '../dog-calendar/period-sharing.js');
test('date export is local, bounded, opt-in, and redacts unrelated fields', async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:375,height:812}});
    const outbound = [];
    await page.route('**/*', route => {outbound.push(route.request().url()); return route.abort();});
    await page.setContent('<button id="opener">打开</button>');
    await page.addScriptTag({path:script});
    await page.evaluate(() => {
      window.samples = [
        {start:'2026-11-20',end:'',mood:'private-note',passphrase:'never-copy',id:'private-id'},
        {start:'2026-10-20',end:'2026-10-24'},
        {start:'2026-09-20',end:'2026-09-24'},
        {start:'2026-08-20',end:'2026-08-24'},
        {start:'2026-07-20',end:'2026-07-24'},
        {start:'2026-12-20',end:'2026-12-24'},
        {start:'2026-02-30',end:'2026-03-02'}
      ];
      window.copies = [];
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async x => window.copies.push(x)}});
      document.querySelector('#opener').addEventListener('click',() => LW5Share.open({records:samples,today:'2026-11-25'}));
    });
    const opener = page.locator('#opener');
    await opener.click();
    const dialog = page.getByRole('dialog',{name:'导出经期日期'});
    const preview = dialog.getByRole('textbox',{name:'经期日期预览'});
    const grant = dialog.getByRole('checkbox');
    const copy = dialog.getByRole('button',{name:'复制日期'});
    const rows = await preview.inputValue();
    assert.match(rows,/2026-08-20/);
    assert.match(rows,/2026-11-20｜结束：未记录/);
    assert.doesNotMatch(rows,/private-|never-copy|2026-07-20|2026-12-20|2026-02-30/);
    assert.equal(await copy.isDisabled(),true);
    assert.deepEqual(await page.evaluate(() => copies),[]);
    await grant.check();
    await dialog.getByRole('combobox').selectOption('3');
    assert.equal(await copy.isDisabled(),true);
    assert.doesNotMatch(await preview.inputValue(),/2026-08-20/);
    await grant.check();
    await copy.click();
    assert.deepEqual(await page.evaluate(() => copies),[await preview.inputValue()]);
    await page.evaluate(() => LW5Share.close());
    assert.equal(await dialog.count(),0);
    assert.equal(await page.evaluate(() => document.activeElement.id),'opener');
    await opener.click();
    assert.equal(await copy.isDisabled(),true);
    await page.keyboard.press('Escape');
    assert.equal(await dialog.count(),0);
    assert.deepEqual(outbound,[]);
  } finally {
    await browser.close();
  }
});
test('clipboard rejection stays in local preview and leaves copy manual', async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.setContent('<main></main>');
    await page.addScriptTag({path:script});
    await page.evaluate(() => {
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async () => {throw Error('blocked')}}});
      LW5Share.open({records:[{start:'2026-11-20',end:'2026-11-24'}],today:'2026-11-25'});
    });
    await page.getByRole('checkbox').check();
    await page.getByRole('button',{name:'复制日期'}).click();
    assert.match(await page.getByRole('status').innerText(),/长按预览文字/);
    assert.equal(await page.evaluate(() => document.activeElement.tagName),'TEXTAREA');
  } finally {
    await browser.close();
  }
});
