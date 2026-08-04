// Fallback id→nombre de owners de HubSpot para SDRs Overview.
//
// POR QUÉ EXISTE ESTO
// -------------------
// Los nombres de los comerciales se resuelven normalmente desde la tabla
// `owners` (la puebla el paso "owners" de `sync-crm` leyendo /crm/v3/owners).
// En producción esa tabla llega vacía —el paso falla, casi seguro porque el
// token privado de HubSpot no tiene el scope `crm.objects.owners.read`—, así
// que TODOS los owner_id de las llamadas se quedaban sin resolver y en la
// pantalla aparecía el id crudo de HubSpot en lugar del nombre. Ni siquiera el
// fallback por email (PR #63) podía actuar, porque sin fila en `owners` no hay
// email que mostrar.
//
// Este mapa es la red de seguridad: se rellena con los owners reales de HubSpot
// (nombre y estado tomados del portal) para que SDRs Overview muestre nombres
// aunque la tabla `owners` esté vacía. La resolución sigue priorizando la tabla
// `owners` cuando SÍ trae nombre; este mapa solo entra si allí no hay dato.
//
// CÓMO QUITARLO (arreglo definitivo)
// ----------------------------------
// Cuando el token de HubSpot tenga `crm.objects.owners.read` y `sync-crm`
// pueble `owners` (verlo en Data Health → "Owners con nombre / total"), este
// fallback deja de usarse solo. Se puede borrar entonces. Mientras tanto, si
// entra un comercial nuevo que no está aquí, saldrá su id hasta que se añada
// (o hasta que el sync de owners empiece a funcionar).
//
// Clave = owner_id de HubSpot (string, igual que `activities.owner_id`).
export const OWNER_NAME_FALLBACK: Record<string, string> = {
  "25820830": "Florence Broderick",
  "29362205": "Bernardo Frangoulis",
  "32684135": "Moritz Rost",
  "52254717": "Sara García",
  "76125746": "Frida Hernández",
  "76125747": "Maria Armada",
  "76125748": "Mario Garcia Jimenez",
  "76125749": "Antonella Masini",
  "76125750": "Jaime de la Torre de Ysasi-Ysasmendi",
  "76125751": "Alvaro San Pedro",
  "76995311": "Sara Álvarez Durán",
  "77495175": "Carlota López-Heredia Romera",
  "78026785": "Manuela Sáez",
  "78026786": "Laszlo Bene",
  "78105512": "Lucía Mosquera",
  "78607390": "Lucas Abad Revert",
  "78607391": "Paula Serrats",
  "78831791": "Ana Candelas",
  "79580723": "Jack Yu",
  "79606458": "Iván Pérez",
  "79606459": "Miguel Perez",
  "79606460": "Juan Casares",
  "79606461": "Gonzalo Cabanas Yuste",
  "79608218": "Rubén Castro",
  "79608219": "Almudena Gómez-Plata",
  "79719098": "Álvaro Cabal García",
  "79861048": "Sergio Prieto",
  "79865948": "Carmen Báscones",
  "79865949": "Davide Lauritano",
  "79874664": "Pablo Benjumea",
  "79958026": "Marina Oliveros García",
  "80412106": "Andrés Bayona",
  "80740350": "Antonella Masini",
  "80740351": "Elliott Dwyer",
  "80740352": "Pato Copado",
  "80740353": "Daniel Jiménez",
  "80740354": "Rubén Castro",
  "82915592": "Lucas Serralta",
  "82915594": "Cristina Marín de Agustín",
  "82915595": "Jaime Simón Antón",
  "82915596": "Tomás Lemus",
  "82915597": "Francisco Gost Scagliarini",
  "82915598": "Jonathan Morse",
  "83210782": "Erik Hsu",
  "83218387": "Iñigo Medina",
  "83519675": "Paula Cons",
  "83858637": "José Nogueiro",
  "83883398": "Álvaro Granados",
  "84501798": "Álvaro Martínez-Laforgue",
  "85841234": "Lucía Chaves",
  "87354578": "Graciel Souza Barbieri",
  "88051198": "Valentin Aman",
  "88051211": "Jean Bauer",
  "88093160": "Jaime de la Torre de Ysasi-Ysasmendi",
  "88443457": "Juan Berges Pastor",
  "89223785": "Jacobo Umbert",
  "89403471": "Óscar Davies Bermejo",
  "89403588": "Juan Kariger",
  "91634260": "Katharina Kehlbreier",
  "91634292": "Andreas Bode",
  "92170152": "Juanjo Mestre",
  "92879738": "Yelyzaveta Adova",
  "92934734": "Paula Cons",
  "93345440": "Simon Stolpe",
  "96191113": "Juan Berges",
  "98299978": "Luis Escamez",
  "99950685": "Juanjo Mestre",
  "99999051": "Victoria Cardona",
  "99999068": "Lauren Junestrand",
  "178806685": "Gonzalo García de Lomana",
  "182138923": "Lucia Cadenas",
  "186996400": "Cristian Villamizar",
  "189435206": "José Román Garzón Rodriguez",
  "189436344": "Janire Garcia",
  "200863035": "Alba Ortiz",
  "217721265": "Lucho Llontop",
  "218956932": "Sergio López del Río",
  "224817015": "Adrian Luque",
  "227372879": "Andrea Fernandez Laris",
  "247029915": "Gonzalo Tourné",
  "250107424": "Pablo Rivadulla",
  "250107444": "Michel Orozco",
  "250111248": "Juanma Martinez",
  "303082525": "Aischa Durand",
  "303087279": "Cecilia Bayas",
  "322297311": "Pedro Atienza",
  "333663504": "Elyza Adova",
  "626687112": "Gelia Pereira",
  "626687267": "Santiago Rodríguez",
  "682399521": "Jorge Latorre Escudero",
};
