# Thermal Lab — Fase 1

Protótipo 2D top-down em JavaScript + HTML5 Canvas focado em física térmica. A regra central é simples: **o jogador move energia; a física determina a temperatura**.

## Rodar

```bash
npm install
npm run dev
```

Depois abra o endereço informado pelo Vite (normalmente `http://localhost:5173`).

## Testar e gerar build

```bash
npm test
npm run build
```

## Missão Hot Room

- Três máquinas ligam após 10 segundos e geram 8 kW, 12 kW e 15 kW de calor.
- Mantenha todas abaixo de 40°C por 5 minutos simulados.
- Limite elétrico: 10 kW.
- Falha se uma máquina permanecer acima de 80°C por 30 segundos.

## Controles

- `WASD`: mover câmera
- roda do mouse: zoom
- clique esquerdo: construir / selecionar
- clique direito ou `Esc`: cancelar ferramenta / voltar à inspeção
- `R`: girar ventilador/exaustor
- `Space`: pausa
- `1`, `2`, `4`: velocidade da simulação
- `F3`: debug físico no tile sob o mouse

## Sistemas implementados

- mapa 64×64 com tiles de 0,5 m;
- materiais: ar, água, concreto, madeira, aço, cobre e isolamento;
- energia térmica, massa, calor específico e condutividade;
- condução com conservação de energia e média harmônica da condutividade;
- máquinas com massa térmica e geração de calor em watts;
- airflow simplificado e conservativo;
- ventiladores e exaustores;
- ambiente externo como reservatório térmico;
- rede simplificada de água com tubo, bomba, tanque, trocador e radiador;
- radiador influenciado pelo airflow;
- consumo elétrico e calor residual dos equipamentos;
- sensores de temperatura;
- orçamento e estoque de equipamentos;
- modos Normal, Térmico, Airflow e Fluido;
- inspector, gráfico de temperatura e Energy Balance;
- vitória/falha da missão;
- testes automatizados de física.

## Observação sobre o modelo físico

A Fase 1 usa aproximações discretas estáveis voltadas a gameplay. Não é CFD de engenharia. Transferências internas são feitas de forma conservativa; saídas/entradas externas são contabilizadas separadamente no Energy Balance.
