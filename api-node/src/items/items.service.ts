import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateItemDto } from './dto/create-item.dto';
import { toItemResponse, type ItemResponse } from './item.response';

/** Prisma's error code for a unique constraint violation. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ordered by id so responses are deterministic across runs and across both stacks. */
  async findAll(): Promise<ItemResponse[]> {
    const items = await this.prisma.item.findMany({ orderBy: { id: 'asc' } });

    return items.map(toItemResponse);
  }

  async findOne(id: number): Promise<ItemResponse> {
    const item = await this.prisma.item.findUnique({ where: { id } });

    if (!item) {
      throw new NotFoundException(`No item exists with id ${id}.`);
    }

    return toItemResponse(item);
  }

  async create(dto: CreateItemDto): Promise<ItemResponse> {
    try {
      const created = await this.prisma.item.create({ data: { ...dto } });

      return toItemResponse(created);
    } catch (error) {
      // Checking the constraint after the fact rather than SELECT-then-INSERT: the database
      // is the only place the uniqueness of a SKU can actually be decided, and a pre-check
      // would still lose the race against a concurrent insert.
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(`An item with sku '${dto.sku}' already exists.`);
      }

      throw error;
    }
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}
