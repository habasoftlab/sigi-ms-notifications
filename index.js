import { WebSocketServer } from 'ws';
import mqtt from 'mqtt';

// --- Strategy Pattern
class WebSocketDelivery {
    async send(payload, activeConnections) {
        const targetSocket = activeConnections.get(payload.receptorId);
        if (targetSocket && targetSocket.readyState === 1) { // 1 = OPEN
            targetSocket.send(JSON.stringify(payload));
            console.log(`[WS] Notificación entregada con éxito al usuario ${payload.receptorId}`);
            return { delivered: true, channel: 'WEBSOCKET' };
        }
        console.log(`[WS] Usuario ${payload.receptorId} no está conectado. Guardando en "No leídas" (Simulado).`);
        return { delivered: false, channel: 'WEBSOCKET' };
    }
}

// --- Dispatcher
class NotificationDispatcher {
    constructor() {
        this.strategies = [];
        this.activeConnections = new Map();
    }

    registerStrategy(strategy) {
        this.strategies.push(strategy);
    }

    async dispatch(payload) {
        const deliveryPromises = this.strategies.map(strategy => 
            strategy.send(payload, this.activeConnections)
        );
        return await Promise.all(deliveryPromises);
    }
}

// --- Init
const dispatcher = new NotificationDispatcher();
dispatcher.registerStrategy(new WebSocketDelivery());

// --- Websocket Server
const wss = new WebSocketServer({ port: 8085 });
console.log('Servidor WebSocket escuchando en el puerto 8085');

wss.on('connection', (ws) => {
    console.log('🔌 Nuevo cliente intentando conectar...');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === 'INIT_SESSION' && data.userId) {
                dispatcher.activeConnections.set(data.userId, ws);
                console.log(`Sesión WebSocket registrada para el usuario: ${data.userId}`);
                
                ws.send(JSON.stringify({ status: "CONNECTED", userId: data.userId }));
            }
        } catch (err) {
            console.error('Error procesando mensaje inicial:', err.message);
        }
    });

    ws.on('close', () => {
        for (let [userId, socket] of dispatcher.activeConnections.entries()) {
            if (socket === ws) {
                dispatcher.activeConnections.delete(userId);
                console.log(`Conexión cerrada para el usuario: ${userId}`);
                break;
            }
        }
    });
});

// --- MQTT Client
const mqttClient = mqtt.connect('mqtt://localhost:1883');

mqttClient.on('connect', () => {
    console.log('Conectado exitosamente al Broker MQTT local');

    mqttClient.subscribe('sigi/notifications/#', (err) => {
        if (!err) console.log('Suscrito al tópico: sigi/notifications/#');
    });
});

mqttClient.on('message', async (topic, message) => {
    try {
        const payload = JSON.parse(message.toString());
        console.log(`\nMensaje recibido en tópico [${topic}]:`, payload);
        
        await dispatcher.dispatch(payload);
    } catch (err) {
        console.error('Error al procesar el mensaje de MQTT:', err.message);
    }
});