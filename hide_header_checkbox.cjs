const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'components/Finance.tsx');
let content = fs.readFileSync(file, 'utf8');

const targetHeader = `<th className="px-6 py-4 w-12 text-center">
  <input type="checkbox"`;

const replacementHeader = `<th className="px-6 py-4 w-12 text-center">
  {filterType !== 'parcelamentos' && <input type="checkbox"`;

content = content.replace(targetHeader, replacementHeader);

const targetClose = `onChange={(e) => setSelectedPayments(e.target.checked ? filteredPayments.filter(p=>p.status !== 'paid').map(p=>p.asaasPaymentId || p.id) : [])}
  />
</th>`;

const replacementClose = `onChange={(e) => setSelectedPayments(e.target.checked ? filteredPayments.filter(p=>p.status !== 'paid').map(p=>p.asaasPaymentId || p.id) : [])}
  />
  }
</th>`;
content = content.replace(targetClose, replacementClose);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed header conditional render');
