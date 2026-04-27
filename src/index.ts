import './lib/setup';

import { createBotClient, startBot } from './lib/client';

const client = createBotClient();

void startBot(client);
