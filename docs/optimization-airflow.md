# Responsividade e streamlines

Análise e correções de 28/09/2026. Execute `node scripts/benchmark-responsiveness.js` para reproduzir os cenários de CPU. Esses testes não medem FPS ou latência de entrada.

## Causas das linhas ausentes

- O orçamento de linhas era preenchido na ordem dos equipamentos e depois de cima para baixo no mapa. Fontes e regiões no final da lista ficavam sem representação.
- A grade esparsa ignorava jatos estreitos entre seus pontos. O limiar do seeder também era maior que o do integrador.
- A assinatura do cache usava velocidades absolutas amostradas: inversões de direção e alterações locais podiam passar despercebidas.

Agora as fontes recebem linhas em rodadas e a amostragem ambiente é distribuída entre 16 regiões. Cada bloco procura uma célula com fluxo, inclusive nas bordas. O cache compara os componentes assinados em todas as células, no máximo a cada 250 ms, independentemente do relógio da animação. Mudanças de mapa, topologia e densidade invalidam imediatamente o cache.

## Resultados reproduzíveis

| Cenário | Antes | Depois |
|---|---:|---:|
| Regiões com sementes, mapa 112 × 72 uniforme | 4/16 | 16/16 |
| Ventiladores representados, 81 fontes | 42/81 | 81/81 |
| Reconstruções em 65 consultas sem fluxo | 65 | 1 |
| Pontos usados para desenhar 125 trajetórias retas atuais | 25.413 sem simplificação | 250 |

A simplificação afeta somente o desenho, preserva curvas dentro de uma tolerância de 0,025 célula e mantém as amostras originais. Os caminhos Canvas são reutilizados e linhas fora da câmera são descartadas. Áreas de captura dos exaustores também são reutilizadas até mudar posição, direção, raio ou topologia.

Nos microbenchmarks locais, a mediana da consulta das áreas de captura passou de cerca de 0,26 ms para 0,025 ms. Os tempos variam com a carga da máquina. Reconstruir as streamlines com cobertura ampliada ficou mais caro: aproximadamente 13 ms contra 6 ms na distribuição antiga incompleta. Essa reconstrução é separada do desenho por quadro e não ocorre enquanto o campo permanece estável. Não se infere uma taxa de FPS desses números.

## Validação e próximos candidatos

Testes cobrem distribuição espacial, fontes bloqueadas, jatos estreitos, inversões de direção, mudanças locais, cache vazio, paredes, simplificação e descarte fora da câmera. A cena visual foi aberta no navegador com o overlay airflow. Build de produção validado. A suíte completa detectou apenas uma expectativa desatualizada dos sprites do técnico; após adaptar o teste ao manifesto, os testes afetados passaram.

Próximos candidatos identificados por leitura, ainda sem ganho quantificado: métricas, inspetor, alertas e gráficos atualizados a cada passo da física; buscas lineares de entidades durante interação. Antes de alterá-los, medir uma partida densa com física ativa e registrar tempo de simulação, renderização e interface separadamente. Qualquer redução da frequência da interface deve preservar seleção imediata e alertas. O solver não foi alterado.

Há um orçamento visual finito de linhas para manter o custo controlado; streamlines são amostras do campo, não uma linha por célula. Sem velocidade suficiente ou diante de paredes, as trajetórias continuam terminando normalmente.
