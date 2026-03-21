const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'server.js');
let content = fs.readFileSync(file, 'utf8');

let changes = 0;

// 1. Add formatInstallmentId helper near isUUID
if (!content.includes('const formatInstallmentId')) {
  content = content.replace(
    "const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);",
    "const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);\nconst formatInstallmentId = (id) => {\n  if (!id) return id;\n  if (id.startsWith('inst_')) return id.replace('inst_', 'ins_');\n  if (isUUID(id)) return `ins_${id}`;\n  return id;\n};\n"
  );
  changes++;
}

// 2. Update POST /api/excluir_cobranca
content = content.replace(
  "const resp = await fetch(`https://sandbox.asaas.com/api/v3/installments/${id}`",
  "const asaasTargetId = formatInstallmentId(id);\n      const resp = await fetch(`https://sandbox.asaas.com/api/v3/installments/${asaasTargetId}`"
);
content = content.replace(
  "console.log(`[Exclusão] Deletando parcelamento ${id} no Asaas...`);",
  "console.log(`[Exclusão] Deletando parcelamento ${asaasTargetId} no Asaas...`);"
);
content = content.replace(
  "const resp = await fetch(`https://sandbox.asaas.com/api/v3/installments/${instId}`",
  "const formattedLoopId = formatInstallmentId(instId);\n        const resp = await fetch(`https://sandbox.asaas.com/api/v3/installments/${formattedLoopId}`"
);

// 3. Update GET /api/parcelamentos/:id/carne
content = content.replace(
  "console.log(`[Carnê] Buscando PDF do parcelamento ${instId} no Asaas...`);\n      const ar = await fetch(`https://sandbox.asaas.com/api/v3/installments/${instId}`, { headers: { 'access_token': process.env.ASAAS_API_KEY } });",
  "const asaasTargetInstId = formatInstallmentId(instId);\n      console.log(`[Carnê] Buscando PDF do parcelamento ${asaasTargetInstId} no Asaas...`);\n      const ar = await fetch(`https://sandbox.asaas.com/api/v3/installments/${asaasTargetInstId}`, { headers: { 'access_token': process.env.ASAAS_API_KEY } });"
);

// 4. Update POST /api/gerar_cobranca
content = content.replace(
  "const installmentId = paymentData.installment;",
  "const installmentId = formatInstallmentId(paymentData.installment);"
);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed server.js with formatInstallmentId');

// Now Finance.tsx - remove any 'inst_' hardcoded logic
const finFile = path.join(__dirname, 'components', 'Finance.tsx');
let finContent = fs.readFileSync(finFile, 'utf8');

let finChanges = 0;
// Make sure frontend treats 'ins_' equivalently and correctly drops 'inst_' restrictions.
// We already removed them in the previous step, but let's double check there is no 'inst_' inside handles.
if (finContent.includes("paymentToDelete.id.startsWith('inst_')")) {
  finContent = finContent.replace(/paymentToDelete\.id\.startsWith\('inst_'\)/g, "(paymentToDelete.id.startsWith('inst_') || paymentToDelete.id.startsWith('ins_'))");
  finChanges++;
}

fs.writeFileSync(finFile, finContent, 'utf8');
console.log(`Fixed Finance.tsx with ${finChanges} remaining prefix cleanup`);
