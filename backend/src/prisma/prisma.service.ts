import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private eventEmitter: EventEmitter2) {
    super()
  }

  async onModuleInit() {
    await this.$connect()
    console.log('✅ Database connected successfully!')
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }

  /**
   * ✅ استدعى الدالة دى قبل أى delete على devices
   */
  async deleteDevice(deviceId: bigint) {
    const device = await this.devices.findFirst({
      where: { id: deviceId },
      select: { id: true, user_id: true }
    })

    const result = await this.devices.delete({
      where: { id: deviceId }
    })

    if (device) {
      this.eventEmitter.emit('device.deleted', {
        deviceId: device.id.toString(),
        userId: device.user_id.toString()
      })
    }

    return result
  }

  async deleteManyDevices(where: any) {
    const devices = await this.devices.findMany({
      where,
      select: { id: true, user_id: true }
    })

    const result = await this.devices.deleteMany({ where })

    for (const device of devices) {
      this.eventEmitter.emit('device.deleted', {
        deviceId: device.id.toString(),
        userId: device.user_id.toString()
      })
    }

    return result
  }
}