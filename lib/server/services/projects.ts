import { assertCanManageProject } from '@/lib/server/authz';
import { BusinessError } from '@/lib/server/api';
import type { z } from 'zod';
import type { DemoSession } from '@/lib/types';
import { projectCreateSchema } from '@/lib/validation';
type Input = z.output<typeof projectCreateSchema>;
import {
  insertProject,
  findDistrict,
  findContract,
} from '@/lib/server/repositories/projects';
export async function createProject(session: DemoSession, input: Input) {
  assertCanManageProject(session);
  const district = await findDistrict(input.districtCode);
  if (!district) {
    throw new BusinessError('DISTRICT_NOT_FOUND', '未找到归属区县', 400, {
      districtCode: ['请选择碑林、雁塔或莲湖'],
    });
  }
  const duplicate = await findContract(input.contractCode);
  if (duplicate) {
    throw new BusinessError(
      'DUPLICATE_CONTRACT',
      '合同编码已存在，请检查',
      409,
      { contractCode: ['合同编码已存在'] },
    );
  }

  return await insertProject(session, input, district);
}
