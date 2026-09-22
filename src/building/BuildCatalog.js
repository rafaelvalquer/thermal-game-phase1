export const BUILD_CATALOG = {
  wall:       { label:'Parede', icon:'▦', cost:35, inventory:50, kind:'material', material:'concrete', category:'Estrutura', description:'Concreto estrutural. Armazena calor e conduz lentamente.' },
  insulation: { label:'Isolante', icon:'▧', cost:25, inventory:20, kind:'material', material:'insulation', category:'Estrutura', description:'Barreira de baixa condutividade para reduzir transferência térmica.' },
  copper:     { label:'Cobre', icon:'▤', cost:80, inventory:10, kind:'material', material:'copper', category:'Estrutura', description:'Condutor térmico de alta eficiência para espalhar calor.' },
  fan:        { label:'Ventilador', icon:'✣', cost:100, inventory:4, kind:'entity', category:'Ar', power:'300 W', description:'Empurra o ar na direção indicada. Não remove calor sozinho.' },
  exhaust:    { label:'Exaustor', icon:'◉', cost:300, inventory:2, kind:'entity', category:'Ar', power:'500 W', description:'Puxa ar quente e transfere energia para o ambiente externo.' },
  pipe:       { label:'Tubo', icon:'━', cost:10, inventory:40, kind:'entity', category:'Água', description:'Conecta os componentes hidráulicos e transporta energia térmica.' },
  pump:       { label:'Bomba', icon:'⟳', cost:600, inventory:1, kind:'entity', category:'Água', power:'800 W', description:'Gera vazão na rede. Mais resistência reduz o fluxo.' },
  tank:       { label:'Tanque', icon:'▰', cost:500, inventory:1, kind:'entity', category:'Água', description:'Grande massa térmica. Armazena calor, mas não o elimina.' },
  radiator:   { label:'Radiador', icon:'▥', cost:700, inventory:2, kind:'entity', category:'Água', description:'Transfere calor da água para o ar; airflow melhora a eficiência.' },
  exchanger:  { label:'Trocador', icon:'HX', cost:450, inventory:3, kind:'entity', category:'Água', description:'Move calor entre uma máquina adjacente e o circuito de água.' },
  sensor:     { label:'Sensor', icon:'°', cost:75, inventory:5, kind:'entity', category:'Controle', description:'Mede temperatura atual, média e máxima do tile.' },
  demolish:   { label:'Remover', icon:'⌫', cost:0, inventory:Infinity, kind:'tool', category:'Ferramenta', description:'Remove equipamentos e materiais construídos.' },
};
