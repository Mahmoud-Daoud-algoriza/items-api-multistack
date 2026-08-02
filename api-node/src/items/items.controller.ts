import { Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CreateItemDto } from './dto/create-item.dto';
import { ItemsService } from './items.service';
import type { ItemResponse } from './item.response';

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  findAll(): Promise<ItemResponse[]> {
    return this.items.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<ItemResponse> {
    return this.items.findOne(parseItemId(id));
  }

  @Post()
  async create(
    @Body() dto: CreateItemDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ItemResponse> {
    const item = await this.items.create(dto);

    // `passthrough: true` keeps Nest in charge of serialising the body and of the default
    // 201 for POST; the handler only contributes the header.
    response.setHeader('Location', `/items/${item.id}`);

    return item;
  }
}

/**
 * The contract answers 404 — not 400 — for a non-numeric id, on the grounds that `/items/abc`
 * simply identifies nothing.
 *
 * Nest's `ParseIntPipe` would answer 400, so the parse is done by hand. Django gets the same
 * behaviour for free from its `<int:pk>` URL converter, which is the first small place these
 * two frameworks disagree about where routing ends and validation begins.
 */
function parseItemId(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new NotFoundException(`No item exists with id '${raw}'.`);
  }

  return Number(raw);
}
