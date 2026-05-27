declare namespace Express {
  interface Request {
    user?: {
      userId: number;
      role: string;
      deviceId: string;
      storeId?: number;
    };
  }
}
