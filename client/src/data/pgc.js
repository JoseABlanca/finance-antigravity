export const PGC_ACCOUNTS = [
    // ACTIVO (ASSET)
    { code: '206', name: 'Aplicaciones informáticas', type: 'ASSET' },
    { code: '210', name: 'Terrenos y bienes naturales', type: 'ASSET' },
    { code: '211', name: 'Construcciones', type: 'ASSET' },
    { code: '213', name: 'Maquinaria', type: 'ASSET' },
    { code: '216', name: 'Mobiliario', type: 'ASSET' },
    { code: '217', name: 'Equipos para procesos de información', type: 'ASSET' },
    { code: '300', name: 'Mercaderías A', type: 'ASSET' },
    { code: '430', name: 'Clientes', type: 'ASSET' },
    { code: '440', name: 'Deudores varios', type: 'ASSET' },
    { code: '470', name: 'Hacienda Pública, deudora por diversos conceptos', type: 'ASSET' },
    { code: '570', name: 'Caja, euros', type: 'ASSET' },
    { code: '572', name: 'Bancos e instituciones de crédito c/c vista, euros', type: 'ASSET' },

    // PASIVO / PATRIMONIO (LIABILITY/EQUITY)
    // Note: App uses LIABILITY for both generically in frontend often, but we map correctly
    { code: '100', name: 'Capital social', type: 'EQUITY' },
    { code: '112', name: 'Reserva legal', type: 'EQUITY' },
    { code: '129', name: 'Resultado del ejercicio', type: 'EQUITY' },
    { code: '170', name: 'Deudas a largo plazo con entidades de crédito', type: 'LIABILITY' },
    { code: '400', name: 'Proveedores', type: 'LIABILITY' },
    { code: '410', name: 'Acreedores por prestaciones de servicios', type: 'LIABILITY' },
    { code: '475', name: 'Hacienda Pública, acreedora por conceptos fiscales', type: 'LIABILITY' },
    { code: '476', name: 'Organismos de la Seguridad Social, acreedores', type: 'LIABILITY' },
    { code: '520', name: 'Deudas a corto plazo con entidades de crédito', type: 'LIABILITY' },

    // GASTOS (EXPENSE)
    { code: '600', name: 'Compras de mercaderías', type: 'EXPENSE' },
    { code: '621', name: 'Arrendamientos y cánones', type: 'EXPENSE' },
    { code: '622', name: 'Reparaciones y conservación', type: 'EXPENSE' },
    { code: '623', name: 'Servicios de profesionales independientes', type: 'EXPENSE' },
    { code: '624', name: 'Transportes', type: 'EXPENSE' },
    { code: '625', name: 'Primas de seguros', type: 'EXPENSE' },
    { code: '626', name: 'Servicios bancarios y similares', type: 'EXPENSE' },
    { code: '627', name: 'Publicidad, propaganda y relaciones públicas', type: 'EXPENSE' },
    { code: '628', name: 'Suministros', type: 'EXPENSE' },
    { code: '629', name: 'Otros servicios', type: 'EXPENSE' },
    { code: '640', name: 'Sueldos y salarios', type: 'EXPENSE' },
    { code: '642', name: 'Seguridad Social a cargo de la empresa', type: 'EXPENSE' },
    { code: '681', name: 'Amortización del inmovilizado material', type: 'EXPENSE' },

    // INGRESOS (REVENUE)
    { code: '700', name: 'Ventas de mercaderías', type: 'REVENUE' },
    { code: '705', name: 'Prestaciones de servicios', type: 'REVENUE' },
    { code: '752', name: 'Ingresos por arrendamientos', type: 'REVENUE' },
    { code: '769', name: 'Otros ingresos financieros', type: 'REVENUE' }
];
