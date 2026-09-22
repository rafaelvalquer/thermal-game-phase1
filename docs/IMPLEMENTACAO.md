# Notas de implementação — Fase 1

## Regra física

A temperatura é derivada da energia térmica. Sistemas internos transferem energia entre reservatórios; não há `temperature -= X` para resfriamento.

## Modelos aproximados

- Condução: Lei de Fourier discreta entre vizinhos cardinais, com média harmônica da condutividade e clamp contra overshoot.
- Airflow: campo vetorial 2D gerado por ventiladores/exaustores; transporte térmico advectivo conservativo por células.
- Exaustão: vazão mássica aproximada em uma zona de sucção e troca com reservatório externo a 25°C.
- Máquinas: capacidade térmica própria, geração em watts e convecção dependente da velocidade local do ar.
- Água: rede conectada com resistência agregada, bomba definindo vazão, circulação conservativa, trocadores máquina↔água e radiadores água↔ar.
- Energia elétrica: consumo monitorado; fração de perdas dos equipamentos entra como calor no sistema.

## Balanceamento validado

Uma solução de referência com 3 trocadores, 33 segmentos/elementos de linha hidráulica, 1 bomba, 2 radiadores, 4 ventiladores e 2 exaustores concluiu a missão dentro do orçamento e limite elétrico. A solução é apenas uma referência; o jogo não força layout único.
