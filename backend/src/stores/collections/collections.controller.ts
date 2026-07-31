import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Request, UseGuards } from '@nestjs/common';
import { CollectionsService } from './collections.service';
import { SessionAuthGuard } from '../../auth/session-auth.guard';

@Controller('stores')
@UseGuards(SessionAuthGuard)
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  /** بتاعة get-or-create السريعة جوه ProductForm — نفس نمط
   *  /stores/products/tags و /stores/products/product-types عندك بالظبط. */
  @Post('products/collections')
  quickCreate(@Request() req, @Body() body: { name: string }) {
    return this.collections.getOrCreateByName(req.user.id, body.name);
  }

  @Get('collections')
  list(@Request() req) {
    return this.collections.list(req.user.id);
  }

  @Get('collections/:id')
  getOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.collections.getOne(req.user.id, id);
  }

  @Post('collections')
  create(@Request() req, @Body() body: any) {
    return this.collections.create(req.user.id, body);
  }

  @Put('collections/:id')
  update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.collections.update(req.user.id, id, body);
  }

  @Delete('collections/:id')
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.collections.remove(req.user.id, id);
  }

  @Post('collections/:id/products')
  addProducts(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() body: { product_ids: string[] }) {
    return this.collections.addProducts(req.user.id, id, body.product_ids);
  }

  @Delete('collections/:id/products/:productId')
  removeProduct(@Request() req, @Param('id', ParseIntPipe) id: number, @Param('productId') productId: string) {
    return this.collections.removeProduct(req.user.id, id, productId);
  }
}