import { Module } from '@nestjs/common';
import { InternalJobsController } from './internal-jobs.controller';

@Module({
  controllers: [InternalJobsController],
})
export class InternalJobsModule {}
