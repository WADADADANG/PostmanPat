import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { Server } from 'socket.io';
import chalk, { type Chalk } from 'chalk';
import * as Types from './types.js';

function log(text: string | number, color: string = 'green') {
    const now = new Date();
    const timestamp = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}]`;
    if (text === undefined || text === null) text = "null/undefined";

    const message = typeof text === 'object' ? JSON.stringify(text, null, 2) : text;
    const logColor = (chalk as any)[color];
    console.log(`${chalk.gray(timestamp)} ${logColor(message)}`);
}

const fastify: FastifyInstance = Fastify({ logger: false });

fastify.register(cors, {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
});

let io: Server;

fastify.register(async (instance) => {
    io = new Server(instance.server, {
        cors: {
            origin: "http://localhost:3000",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        log(`[Connected] ID: ${socket.id}`, 'cyan');

        socket.on('authenticate', (data: { userId: string, gameId: string }) => {
            const userId = data.userId;
            socket.join(`user:${data.userId}`);
            log(`[Auth] User: ${userId} | Game: ${data.gameId} | Socket: ${socket.id}`, 'green');
        });

        socket.on('disconnect', () => {
            log(`[Disconnected] ID: ${socket.id}`, 'yellow');
        });
    });

    instance.decorate('io', io);
});

fastify.post('/:targetId/:gameId/:eventName/:valueData', async (request: FastifyRequest<{ Params: Types.RequestParams }>, reply) => {
    const { targetId, gameId, eventName, valueData } = request.params as any;
    const body = request.body;

    if (io) {

        const roomName = `user:${targetId}`;
        const eventNameFull = `${gameId}-update`;

        const socketsInRoom = await io.in(roomName).fetchSockets();

        if (socketsInRoom.length === 0) {
            log(`[Warning] No active sockets for ${roomName}`, 'yellow');
        }

        io.to(roomName).emit(eventNameFull, {
            eventName,
            valueData,
            targetId
        }, body);

        log(`*********************************************************************************************`, 'red');
        log(`[Event Sent] Count ${socketsInRoom.length} Target: ${targetId}`, 'green');
        log(` > Game: ${gameId}`, 'white');
        log(` > Event: ${eventName}`, 'white');
        log(` > Data: ${valueData}`, 'white');
        return { status: 'success', sentTo: socketsInRoom.length };
    }

    return reply.status(500).send({ error: 'Socket server not ready' });
});

const start = async () => {
    try {
        await fastify.ready();
        await fastify.listen({ port: 3001, host: '0.0.0.0' });
        log(`Fastify Server running at http://localhost:3001`, 'magenta');
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

start();