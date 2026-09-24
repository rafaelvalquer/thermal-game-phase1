# Airflow, exaustão e balanceamento térmico

## Implementação

- O fan aplica impulso de pressão em duas faces, antes do arrasto, das condições de contorno e da projeção. A curva permanece `ΔPmax × (1 − (Q/Qfree)²)`. O impulso é limitado pela velocidade de vazão livre; o solver de pressão continua responsável pelas perdas geométricas.
- Curvas de produção: fan **2,6 m³/s / 160 Pa / 300 W**, exaustor **3,2 m³/s / 220 Pa / 500 W**. Áreas: 0,65 e 0,72 m².
- `ExhaustCaptureSystem` aplica captura com raio de 3,5 tiles, intensidade 0,8 e decaimento espacial. Visibilidade conservadora impede captura através de paredes e cantos.
- A exaustão só contabiliza rejeição externa quando aponta para a borda externa ou através de uma abertura externa adjacente. A classificação usa as salas do mapa e conectividade ao exterior, atualizada quando a topologia muda. Abertura para outra sala não é saída externa.
- Estados: `READY`, `NO OUTLET`, `BLOCKED`, `HIGH RESISTANCE`. Rejeição usa a vazão medida após a projeção e a entalpia do ar capturado, com a energia registrada no ambiente e nas métricas.
- Convecção das máquinas: UA passivo **65 W/K**, coeficiente forçado **350 W/K por m/s**. O valor inicial proposto de 170 não bastou; 450 facilitava excessivamente uma máquina isolada de 15 kW. A velocidade usada é a média das células de superfície, não a velocidade na boca do fan. Não há bônus por quantidade de fans.
- A advecção térmica anterior misturava diferenças de temperatura simetricamente. Agora transporta entalpia do doador no sentido do fluxo, com subpassos CFL e contabilização da entalpia que cruza a borda externa. Fans internos não eliminam energia.
- O stencil Jacobi do solver foi mantido, removendo apenas alocações de funções no laço interno. Supressão de difusão turbulenta junto às paredes passou de 1,15 para 4, preservando a retenção do jato em corredores.
- Inspector e F3 apresentam vazão livre/real, eficiência de fluxo, faixas de restrição, geração, resfriamento, balanço e rejeição térmica. Streamlines recebem sementes na entrada do exaustor para mostrar sucção.

As cargas de **8/12/15 kW**, o objetivo de **40°C** e os **300 segundos** da missão permanecem intactos. As alterações locais de Simple Cooling foram preservadas; seu solver de distribuição continua separado do FanModel.

## Estratégia reproduzível da Fase 1

Coordenadas do grid, começando em zero:

| Equipamento | Posição | Direção |
|---|---|---|
| Fan M1 | 19,18 | direita |
| Fan M2 | 31,18 | direita |
| Fan M3 | 43,18 | direita |
| Fan auxiliar M3 | 44,19 | cima |
| Exaustor | 54,17 | direita |
| Exaustor | 54,19 | direita |

O cenário usa o mapa, as entidades, o validador de construção, o orçamento, o inventário e a simulação de produção. Custa $1.000 e consome 2,2 kW; não instala refrigeração ativa. Verifica também 300 segundos **consecutivos** abaixo de 40°C, independentemente da regra de acumulação da missão.

O cenário original, antes da correção, não venceu: aproximadamente **41,13 / 48,85 / 54,27°C** aos 350 s. Após a calibração, a estratégia vence perto dos 310 s, com máxima entre as máquinas de aproximadamente **38,35°C**.

O ensaio prolongado é separado da vitória da campanha: estende a duração da missão para medir equilíbrio. A configuração acima não promete operação indefinida abaixo de 40°C. Aos 1.200 s, a rejeição externa média fica próxima de **34,4 kW**, diante de **35,44 kW** gerados incluindo perdas dos motores; as temperaturas se aproximam de **39,3 / 43,6 / 41,3°C**. Para operação além da janela da missão, é necessário melhorar a instalação ou adicionar refrigeração. Isso não é usado para encurtar nem relaxar o teste de vitória.

## Validação e rastreabilidade

| Critério do plano | Evidência automatizada |
|---|---|
| Fan aberto ≥65%, dead-end <60%, dois fans úteis, métricas | `tests/airflow/fanPerformance.test.js` |
| Paredes, divergência, decaimento, corredores, curva, pressão | `tests/airflow/airflowPhysics.test.js` |
| Captura, visibilidade, calor externo, saídas válidas/inválidas | `tests/airflow/exhaustPerformance.test.js` |
| Advecção direcional, CFL, calor/frio limitados e conservação | `tests/airflow/thermalTransport.test.js` |
| Convecção significativa; 8/12/15 kW; dois fans; sala fechada | `tests/thermal/machineCooling.test.js` |
| Vitória por 300 s, um fan ruim, quatro fans espalhados | `tests/balance/level01Cooling.test.js` |
| Balanço no Inspector, eficiência e estado de saída | `tests/airflow/diagnostics.test.js` |
| Streamlines, sementes de sucção, paredes e curvas | `tests/rendering/airflow/streamlines.test.js` |
| Heat haze e heatmap | suíte `tests/rendering/` e inspeção visual no navegador |

O balanço de energia inclui energia inicial, calor gerado, exportação externa e energia interna final. O teste de campanha exige erro absoluto inferior a 0,01 J. O teste fechado sem exaustão exige exportação zero e aumento da energia interna exatamente pelo calor gerado.

Validação final: **135 testes gerais aprovados + 3 cenários de campanha aprovados**, build de produção aprovado e `git diff --check` sem erros. O cenário de teste de propriedade de redes de Simple Cooling foi corrigido para ativar explicitamente esse modo; a regra de produção não foi relaxada. As amostras do ensaio prolongado estão em `airflow-soak-results.json` (potências em W, temperaturas em °C, balanço em J).

No ambiente Windows com criação de processos filhos restrita, a execução equivalente usada para a suíte foi importar os arquivos `*.test.js` em um único processo Node. O comando normal de CI continua sendo `npm test`.

## Comandos

```sh
npm test
npm run build
npm run balance:airflow
npm run balance:airflow -- --q=2.2,2.4,2.6,2.8 --pressure=140,160,180 --ua=170,300,350,450
npm run balance:airflow -- --seconds=1200 --soak
```

O script imprime JSON e tabela com temperaturas, vitória, geração, resfriamento, rejeição, temperatura média da sala, operating point e erro de energia. A varredura completa é deliberadamente mais demorada que uma execução de referência. `--soak` estende a missão; nesse modo `won=false` não representa reprovação do teste normal de 300 s.
