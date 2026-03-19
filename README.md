# EduManager - Sistema de Gestão Escolar

Este é um sistema de gestão escolar desenvolvido com React, TypeScript e Vite.

## Como fazer o deploy no Netlify

1.  **Baixe o código**: Faça o download de todos os arquivos deste projeto.
2.  **Crie um repositório Git**: Inicie um repositório Git local e faça o commit dos arquivos.
    ```bash
    git init
    git add .
    git commit -m "Initial commit"
    ```
3.  **Envie para o GitHub/GitLab/Bitbucket**: Crie um repositório remoto e envie seu código.
4.  **Conecte ao Netlify**:
    *   Acesse [netlify.com](https://www.netlify.com/).
    *   Clique em "Add new site" -> "Import an existing project".
    *   Selecione seu provedor Git e o repositório.
5.  **Configurações de Build**:
    *   O Netlify deve detectar automaticamente as configurações do arquivo `netlify.toml`.
    *   **Build command**: `npm run build`
    *   **Publish directory**: `dist`
6.  **Variáveis de Ambiente**:
    *   No painel do Netlify, vá em **Site settings > Environment variables**.
    *   Adicione as variáveis do Supabase (se estiver usando):
        *   `VITE_SUPABASE_URL`: Sua URL do projeto Supabase.
        *   `VITE_SUPABASE_KEY`: Sua chave pública (anon key) do Supabase.
7.  **Deploy**: Clique em "Deploy site".

## Funcionalidades

*   Cadastro de Alunos e Turmas
*   Gestão Financeira
*   Geração de Contratos em PDF
*   Dashboard com Gráficos
*   Backup Local e na Nuvem (Supabase)

## Desenvolvimento Local

Para rodar o projeto localmente:

1.  Instale as dependências: `npm install`
2.  Rode o servidor de desenvolvimento: `npm run dev`
