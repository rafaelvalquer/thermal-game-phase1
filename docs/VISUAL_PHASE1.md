# Fase Visual 1

Branch: feat/visual-improvements-phase1

## Objetivo

Transformar o protótipo funcional em uma interface técnico-industrial legível, mantendo a física como fonte do feedback visual.

## Implementado

- identidade procedural distinta para máquinas, ventiladores, exaustores, bomba, tanque, radiador, trocador, tubos e sensores;
- estados térmicos consistentes: estável, aquecendo, quente, superaquecendo e crítico;
- animação de hélices, rotor da bomba, água circulando e indicadores;
- tubos com conexão automática por vizinhança e cor da água por temperatura;
- efeitos de calor, shimmer simplificado, warnings e partículas de airflow/exaustão;
- heatmap refinado com destaque de hotspots;
- airflow com vetores direcionais e intensidade visual;
- modo fluido com conexões, temperatura e pulsos de vazão;
- preview de construção com validade e cone de direção para fan/exhaust;
- seleção visual de equipamentos;
- materiais com texturas próprias para concreto, isolamento e cobre;
- HUD reorganizada em cartões de telemetria;
- alertas HOTSPOT, OVERHEAT, POWER LIMIT e LOW FLOW;
- inspector com identidade do equipamento e status térmico;
- catálogo de construção com descrições físicas e consumo;
- gráfico com linha de referência de 40 °C.

## Princípio

Nenhum efeito altera a simulação. Temperatura, vazão, airflow e estados exibidos são lidos do estado físico existente.

## Próximo passo de arte

A camada procedural foi mantida intencionalmente para validar leitura e UX. Spritesheets podem substituir os desenhos de Canvas posteriormente mantendo a mesma API de renderização.
