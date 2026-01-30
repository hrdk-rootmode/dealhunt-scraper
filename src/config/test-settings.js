const settings = require('./settings');

console.log('🧪 Testing Settings Configuration...\n');

// Print summary
settings.printSummary();

// Test individual functions
console.log('📊 Enabled Platforms:', settings.getEnabledPlatforms().map(p => p.name));
console.log('📊 Enabled Categories:', settings.getEnabledCategories().map(c => c.key));
console.log('📊 Festival Status:', settings.isInFestival());
console.log('📊 Smartphones Quota:', settings.getTodayQuota('smartphones'));
console.log('📊 Amazon + Smartphones Search:', settings.getSearchTerm('amazon', 'smartphones'));
console.log('📊 Total Daily Quota:', settings.getTotalDailyQuota());

console.log('\n✅ Settings test complete!');