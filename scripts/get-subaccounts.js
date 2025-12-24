// Quick script to fetch subaccount IDs
// Run: node scripts/get-subaccounts.js

require('dotenv').config({ path: '.env.local' });
const { getSubaccounts } = require('../lib/lyra-auth');

async function main() {
  try {
    const subaccounts = await getSubaccounts();
    console.log('\n📋 Your Subaccounts:');
    console.log('==================\n');
    subaccounts.forEach((acc) => {
      console.log(`ID: ${acc.subaccount_id}`);
      console.log(`Label: ${acc.label || '(no label)'}`);
      console.log(`Portfolio Value: $${parseFloat(acc.portfolio_value).toFixed(2)}`);
      console.log(`Margin Balance: $${parseFloat(acc.margin_balance || '0').toFixed(2)}`);
      console.log('---');
    });
    console.log(`\n✅ Use subaccount_id: ${subaccounts[0]?.subaccount_id || 1}\n`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Try subaccount_id: 1 (most common default)\n');
  }
}

main();

