import {test,expect} from '@playwright/test';
import {loadScenario,switchTo} from './helpers';
test('consultant can inspect the fictional context comparison and adaptive interviews @phone',async({page})=>{
 await loadScenario(page,null);
 await switchTo(page,'Alex Morgan');
 await page.goto('/consultant/quality/context');
 await expect(page.getByRole('heading',{name:'Different people. Different jobs.'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Scenario checks passed'})).toBeVisible();
 await expect(page.getByRole('columnheader',{name:'Hands-on role'})).toBeVisible();
 await page.getByRole('link',{name:'Follow-up conversations',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Joining a more experienced team'})).toBeVisible();
 await page.screenshot({path:`/workspace/scratch/7b722bbfd120/test-runtime/context-${test.info().project.name}.png`,fullPage:true});
});
