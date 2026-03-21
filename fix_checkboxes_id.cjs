const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'components/Finance.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Fix Carne bulk initial select
content = content.replace(
  "setCarneSelectedPayments(group.payments.filter(p => p.status !== 'paid').map(p => p.id))",
  "setCarneSelectedPayments(group.payments.filter(p => p.status !== 'paid').map(p => p.asaasPaymentId || p.id))"
);

// 2. Fix Carne checkboxes onChange / includes
content = content.replace(
  /checked=\{carneSelectedPayments\.includes\(p\.id\)\}/g,
  "checked={carneSelectedPayments.includes(p.asaasPaymentId || p.id)}"
);
content = content.replace(
  /setCarneSelectedPayments\(prev => \[\.\.\.prev, p\.id\]\)/g,
  "setCarneSelectedPayments(prev => [...prev, p.asaasPaymentId || p.id])"
);
content = content.replace(
  /prev\.filter\(id => id !== p\.id\)/g,
  "prev.filter(id => id !== (p.asaasPaymentId || p.id))"
);

// 3. Fix Main List checkboxes all
content = content.replace(
  /filteredPayments\.filter\(p=>p\.status !== 'paid'\)\.map\(p=>p\.id\)/g,
  "filteredPayments.filter(p=>p.status !== 'paid').map(p=>p.asaasPaymentId || p.id)"
);

// 4. Fix Main List single checkbox onChange / includes
content = content.replace(
  /checked=\{selectedPayments\.includes\(payment\.id\)\}/g,
  "checked={selectedPayments.includes(payment.asaasPaymentId || payment.id)}"
);
content = content.replace(
  /setSelectedPayments\(prev => e\.target\.checked \? \[\.\.\.prev, payment\.id\] : prev\.filter\(id => id !== payment\.id\)\)/g,
  "setSelectedPayments(prev => e.target.checked ? [...prev, payment.asaasPaymentId || payment.id] : prev.filter(id => id !== (payment.asaasPaymentId || payment.id)))"
);


fs.writeFileSync(file, content, 'utf8');
console.log('Finance.tsx checkbox identifiers fixed');
