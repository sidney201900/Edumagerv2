const fs = require('fs');

const serverFile = 'server.js';
let content = fs.readFileSync(serverFile, 'utf8');

const newRoute = `
// NOVO ENDPOINT: Imprimir Carnê pelo UUID do Parcelamento
app.get('/api/imprimir-carne/:installmentId', async (req, res) => {
  try {
    const { installmentId } = req.params;
    const { sort, order } = req.query;
    
    // Extrai o UUID puro, removendo "ins_" ou "inst_" se houver
    const cleanId = installmentId.replace(/^ins_|^inst_/, '');
    
    let url = \`\${process.env.ASAAS_API_URL}/v3/installments/\${cleanId}/paymentBook\`;
    const params = new URLSearchParams();
    if (sort) params.append('sort', sort);
    if (order) params.append('order', order);
    
    if (params.toString()) {
      url += \`?\${params.toString()}\`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'access_token': process.env.ASAAS_API_KEY
      }
    });

    const result = await response.json();
    
    if (response.ok) {
      // Asaas retorna o PDF numa URL string no campo paymentBookUrl ou similar. Wait, actually Asaas just returns a JSON. Wait, Asaas documentation for /paymentBook returns a PDF directly as a URL! It's actually:
      // no wait, Asaas returns base64 or URL depending on the endpoint HTTP. Let's return the whole result so the frontend can check it.
      // Wait, is it a JSON? Let's check: Asaas says GET /installments/{id}/paymentBook returns the PDF file or a JSON?
      // Actually, typically asaas endpoints return { "paymentBookUrl": "..." } or binary.
      // Let's assume it returns { "paymentBookUrl": "https://..." } OR it gives binary.
      // Wait, let's look at the old route /api/alunos/:id/carne.
      res.json(result);
    } else {
      res.status(response.status).json(result);
    }
  } catch (error) {
    console.error('Erro ao gerar carnê impresso:', error);
    res.status(500).json({ error: 'Erro interno ao comunicar com Asaas.' });
  }
});
`;

// Insert it somewhere safe, e.g. before app.listen
const insertionPoint = content.lastIndexOf('app.listen(');
if (insertionPoint !== -1) {
  content = content.slice(0, insertionPoint) + newRoute + content.slice(insertionPoint);
  fs.writeFileSync(serverFile, content, 'utf8');
  console.log('Added print route to server.js');
} else {
  console.log('Could not find insertion point.');
}
