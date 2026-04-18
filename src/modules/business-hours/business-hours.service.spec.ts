import { Test, TestingModule } from '@nestjs/testing';
import { BusinessHoursService } from './business-hours.service';

describe('BusinessHoursService', () => {
  let service: BusinessHoursService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BusinessHoursService],
    }).compile();

    service = module.get<BusinessHoursService>(BusinessHoursService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
