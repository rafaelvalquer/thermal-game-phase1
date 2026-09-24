import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILD_CATALOG } from '../src/building/BuildCatalog.js';
import { clearToolbarSearch, groupToolbarTools, isToolbarCategoryOpen, openCategoryForTool, toggleToolbarCategory } from '../src/ui/Toolbar.js';

test('toolbar groups every catalog tool by its category',()=>{
  const groups=groupToolbarTools(BUILD_CATALOG);
  assert.equal(groups.reduce((count,group)=>count+group.tools.length,0),Object.keys(BUILD_CATALOG).length);
  assert.deepEqual(groups.map(group=>group.category),[...new Set(Object.values(BUILD_CATALOG).map(tool=>tool.category))]);
});

test('toolbar search matches tool names, descriptions, and categories without accents',()=>{
  const byName=groupToolbarTools(BUILD_CATALOG,'ventilador');
  assert.deepEqual(byName.map(group=>group.category),['Ar']);
  assert.deepEqual(byName[0].tools.map(tool=>tool.id),['fan']);
  const byDescription=groupToolbarTools(BUILD_CATALOG,'ar frio');
  assert.ok(byDescription.some(group=>group.tools.some(tool=>tool.id==='coolingUnit')));
  const byCategory=groupToolbarTools(BUILD_CATALOG,'climatizacao');
  assert.equal(byCategory.length,1);
  assert.equal(byCategory[0].category,'Climatização');
});

test('toolbar categories start collapsed, open the selected tool group, and search opens matches',()=>{
  const openCategories=new Set(),groups=groupToolbarTools(BUILD_CATALOG);
  assert.equal(isToolbarCategoryOpen('Ar','',openCategories),false);
  openCategoryForTool(BUILD_CATALOG,'fan',openCategories);
  assert.equal(isToolbarCategoryOpen('Ar','',openCategories),true);
  assert.equal(isToolbarCategoryOpen('Climatização','',openCategories),false);
  const searchGroups=groupToolbarTools(BUILD_CATALOG,'duto');
  assert.ok(searchGroups.every(group=>isToolbarCategoryOpen(group.category,'duto',openCategories)));
});

test('toolbar category controls toggle and Escape clears a non-empty search',()=>{
  const openCategories=new Set();
  assert.equal(toggleToolbarCategory('Climatização',openCategories),true);
  assert.equal(isToolbarCategoryOpen('Climatização','',openCategories),true);
  assert.equal(toggleToolbarCategory('Climatização',openCategories),false);
  assert.equal(isToolbarCategoryOpen('Climatização','',openCategories),false);
  const input={value:'exaustor'};
  assert.equal(clearToolbarSearch(input),true);
  assert.equal(input.value,'');
  assert.equal(clearToolbarSearch(input),false);
});
