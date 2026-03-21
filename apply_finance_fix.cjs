const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'components', 'Finance.tsx');
let lines = fs.readFileSync(file, 'utf8').split('\n');
let changes = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].replace(/\r$/, '');

  // 1. Replace the ID extraction block in handleDelete
  if (line.includes("let asaasIdToDelete = '';")) {
    // Check if the next lines are the old logic
    let j = i + 1;
    while (j < lines.length && !lines[j].includes('if (!asaasIdToDelete) {')) j++;
    
    if (j < lines.length && (j - i) > 5) {
      console.log('Found ID extraction block from line', i, 'to', j);
      const newBlock = `    let asaasIdToDelete = '';
    let isInstallmentPackage = false;
    
    // 1. Se passamos explicitamente o asaasIdParaExcluir (ex: lixeira do grupo de carnê)
    if ((paymentToDelete as any).asaasIdParaExcluir) {
      asaasIdToDelete = (paymentToDelete as any).asaasIdParaExcluir;
      isInstallmentPackage = true;
    }
    // 2. Se for para excluir TUDO (o pacote agrupado, ou usuário clicou em 'Excluir Carnê Completo' numa parcela)
    else if (deleteType === 'all') {
      asaasIdToDelete = paymentToDelete.installmentId || paymentToDelete.id;
      isInstallmentPackage = true;
    }
    // 3. Se for exclusão de apenas uma parcela individual
    else {
      asaasIdToDelete = paymentToDelete.asaasPaymentId || paymentToDelete.id;
      isInstallmentPackage = false;
    }\r`;
      
      lines.splice(i, j - i, newBlock);
      changes++;
    }
  }
  
  // 2. Replace the showAlert text
  if (line.includes("showAlert('Aguarde', (asaasIdToDelete.startsWith('inst_') || asaasIdToDelete.startsWith('ins_')) ?")) {
    lines[i] = "      showAlert('Aguarde', isInstallmentPackage ? 'Excluindo carnê completo no Asaas...' : 'Excluindo cobrança no Asaas...', 'info');\r";
    changes++;
  }
  
  // 3. Replace the state update logic
  if (line.includes("if (asaasIdToDelete.startsWith('inst_') || asaasIdToDelete.startsWith('ins_')) {")) {
    lines[i] = "        if (isInstallmentPackage) {\r";
    // Also fix the else branch for state update
    for (let k = i + 1; k < i + 5; k++) {
      if (lines[k] && lines[k].includes("updatedPayments = updatedPayments.filter(p => p.asaasPaymentId !== asaasIdToDelete);")) {
        lines[k] = lines[k].replace(
          "updatedPayments = updatedPayments.filter(p => p.asaasPaymentId !== asaasIdToDelete);",
          "updatedPayments = updatedPayments.filter(p => p.asaasPaymentId !== asaasIdToDelete && p.id !== asaasIdToDelete);"
        );
        changes++;
      }
    }
    changes++;
  }
}

// 4. Also fix printing PDF to not require 'inst_' in OpenPaymentLink
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("if (type === 'carne' && asaasId && (asaasId.startsWith('inst_') || asaasId.startsWith('ins_'))) {")) {
    lines[i] = lines[i].replace(
      "if (type === 'carne' && asaasId && (asaasId.startsWith('inst_') || asaasId.startsWith('ins_'))) {",
      "if (type === 'carne' && asaasId) {"
    );
    changes++;
  }
}

if (changes > 0) {
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  console.log('Successfully applied ' + changes + ' changes to Finance.tsx');
} else {
  console.log('No changes needed/found in Finance.tsx');
}
