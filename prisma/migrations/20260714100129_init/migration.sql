-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('ATM', 'GATEWAY', 'SWITCH', 'ROUTER', 'SERVER', 'BRANCH', 'ISP', 'OTHER');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('UP', 'DOWN', 'WARNING', 'UNREACHABLE', 'PAUSED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Node" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "type" "NodeType" NOT NULL DEFAULT 'ATM',
    "region" TEXT,
    "branch" TEXT,
    "parentId" TEXT,
    "mapId" TEXT NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "posY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "icon" TEXT NOT NULL DEFAULT 'atm',
    "size" INTEGER NOT NULL DEFAULT 48,
    "labelMode" TEXT NOT NULL DEFAULT 'NAME_IP',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalSec" INTEGER NOT NULL DEFAULT 30,
    "latencyWarnMs" INTEGER NOT NULL DEFAULT 200,
    "status" "Status" NOT NULL DEFAULT 'UNKNOWN',
    "lastLatency" DOUBLE PRECISION,
    "lastCheckAt" TIMESTAMP(3),
    "lastChangeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Node_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Edge" (
    "id" TEXT NOT NULL,
    "mapId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "sourceHandle" TEXT,
    "targetHandle" TEXT,
    "lineType" TEXT NOT NULL DEFAULT 'smoothstep',
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "width" INTEGER NOT NULL DEFAULT 2,
    "label" TEXT,
    "animated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Edge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Map" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bgType" TEXT NOT NULL DEFAULT 'dots',

    CONSTRAINT "Map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PingResult" (
    "id" BIGSERIAL NOT NULL,
    "nodeId" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isAlive" BOOLEAN NOT NULL,
    "latencyMs" DOUBLE PRECISION,
    "lossPct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PingResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PingHourly" (
    "id" BIGSERIAL NOT NULL,
    "nodeId" TEXT NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "avgLatency" DOUBLE PRECISION,
    "maxLatency" DOUBLE PRECISION,
    "uptimePct" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PingHourly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusEvent" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "from" "Status" NOT NULL,
    "to" "Status" NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rootCause" TEXT,

    CONSTRAINT "StatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Node_ipAddress_key" ON "Node"("ipAddress");

-- CreateIndex
CREATE INDEX "Node_mapId_idx" ON "Node"("mapId");

-- CreateIndex
CREATE INDEX "Node_parentId_idx" ON "Node"("parentId");

-- CreateIndex
CREATE INDEX "Edge_mapId_idx" ON "Edge"("mapId");

-- CreateIndex
CREATE UNIQUE INDEX "Map_slug_key" ON "Map"("slug");

-- CreateIndex
CREATE INDEX "PingResult_nodeId_ts_idx" ON "PingResult"("nodeId", "ts");

-- CreateIndex
CREATE INDEX "PingHourly_nodeId_hour_idx" ON "PingHourly"("nodeId", "hour");

-- CreateIndex
CREATE UNIQUE INDEX "PingHourly_nodeId_hour_key" ON "PingHourly"("nodeId", "hour");

-- CreateIndex
CREATE INDEX "StatusEvent_nodeId_ts_idx" ON "StatusEvent"("nodeId", "ts");

-- AddForeignKey
ALTER TABLE "Node" ADD CONSTRAINT "Node_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Node"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PingResult" ADD CONSTRAINT "PingResult_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PingHourly" ADD CONSTRAINT "PingHourly_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
