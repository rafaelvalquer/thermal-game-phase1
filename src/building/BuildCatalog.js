export const BUILD_CATALOG = {
  wall:       { label:'Parede', icon:'▦', cost:35, inventory:50, kind:'material', material:'concrete' },
  insulation: { label:'Isolante', icon:'▧', cost:25, inventory:20, kind:'material', material:'insulation' },
  copper:     { label:'Cobre', icon:'▤', cost:80, inventory:10, kind:'material', material:'copper' },
  fan:        { label:'Ventilador', icon:'➤', cost:100, inventory:4, kind:'entity' },
  exhaust:    { label:'Exaustor', icon:'⇥', cost:300, inventory:2, kind:'entity' },
  pipe:       { label:'Tubo', icon:'━', cost:10, inventory:40, kind:'entity' },
  pump:       { label:'Bomba', icon:'P', cost:600, inventory:1, kind:'entity' },
  tank:       { label:'Tanque', icon:'T', cost:500, inventory:1, kind:'entity' },
  radiator:   { label:'Radiador', icon:'R', cost:700, inventory:2, kind:'entity' },
  exchanger:  { label:'Trocador', icon:'X', cost:450, inventory:3, kind:'entity' },
  sensor:     { label:'Sensor', icon:'S', cost:75, inventory:5, kind:'entity' },
  demolish:   { label:'Remover', icon:'⌫', cost:0, inventory:Infinity, kind:'tool' },
};
