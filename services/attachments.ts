import { apiRequest, ApiClientError } from '@/lib/api-client';

export interface UploadedAttachment {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export async function uploadAttachment(
  file: File,
  entityType: 'PROJECT' | 'RECEIPT' | 'COLLECTION',
  entityId: string,
): Promise<UploadedAttachment> {
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) {
    throw new ApiClientError('单个附件不能超过 10MB', 'FILE_TOO_LARGE');
  }
  if (
    !['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'].includes(
      file.type,
    )
  ) {
    throw new ApiClientError(
      '仅支持 PDF、JPG、PNG 格式',
      'UNSUPPORTED_FILE_TYPE',
    );
  }
  const body = new FormData();
  body.set('file', file);
  body.set('entityType', entityType);
  body.set('entityId', entityId);
  return apiRequest<UploadedAttachment>('/api/v1/attachments', {
    method: 'POST',
    body,
  });
}
