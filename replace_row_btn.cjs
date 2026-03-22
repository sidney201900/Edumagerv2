const fs = require('fs');
const file = 'components/Finance.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(/onClick=\{\(\) => handleOpenPaymentLink\(group\.installmentId, 'carne'\)\}/g, "onClick={() => executePrintCarne(group.installmentId, 'dueDate')}");

// There might be another occurence if there's multiple spacing differences so we do a safer replace:
c = c.replace(/onClick=\{\s*\(\)\s*=>\s*handleOpenPaymentLink\(group\.installmentId,\s*'carne'\)\s*\}/g, "onClick={() => executePrintCarne(group.installmentId, 'dueDate')}");

fs.writeFileSync(file, c, 'utf8');
console.log('Finance.tsx updated with new executePrintCarne row calls!');
