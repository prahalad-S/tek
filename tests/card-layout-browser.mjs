import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const idle=()=>expect(page.locator('.directory')).toHaveClass(/people-phase-idle/);
try{
 await page.goto('http://127.0.0.1:5173/preview/people');await expect(page.locator('.person-card')).toHaveCount(12);
 for(const action of [()=>page.getByLabel('Filter department').selectOption('Engineering'),()=>page.getByLabel('Filter department').selectOption(''),()=>page.getByLabel('Filter location').selectOption('London, UK'),()=>page.getByLabel('Filter location').selectOption(''),()=>page.getByRole('button',{name:'Descending',exact:true}).click(),()=>page.getByRole('button',{name:'List view',exact:true}).click(),()=>page.getByRole('button',{name:'Card view',exact:true}).click()]){
  await action();await expect(page.locator('.directory')).toHaveClass(/people-phase-reflowing/);
  expect(await page.locator('.person-info,.person-card-footer').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).opacity==='1'&&getComputedStyle(n).visibility==='visible'))).toBe(true);
  expect(await page.locator('body > [data-flight-id]').count()).toBe(0);await idle();
 }
 await page.locator('.person-card').first().click();await expect(page.locator('.directory')).toHaveClass(/people-phase-moving/);await idle();await expect(page.locator('.expanded-person')).toBeVisible();
 await page.goto('http://127.0.0.1:5173/preview/projects');await expect(page.locator('.project-card')).toHaveCount(4);
 await page.getByRole('button',{name:'Project list view',exact:true}).click();await expect(page.locator('.project-grid--list')).toBeVisible();await expect(page.getByRole('button',{name:'Project list view',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.locator('.project-card').first().click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Close dialog'}).click();
 await page.screenshot({path:'review/interaction-polish/project-list.png'});
 await page.getByRole('button',{name:'Project grid view',exact:true}).click();await expect(page.locator('.project-grid--list')).toHaveCount(0);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Project list view',exact:true}).click();await expect(page.locator('.project-grid--list')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);console.log('Passed: People contents remain visible during filter/sort/view motion; profile retains staged transition; project grid/list works on desktop/mobile and opens project details.');
}finally{await browser.close();}
