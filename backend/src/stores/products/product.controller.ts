import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, Request, UseGuards,
} from '@nestjs/common'
import { SessionAuthGuard } from '../../auth/session-auth.guard'
import { ProductService } from './product.service'
import { ProductStatus } from '@prisma/client'
@Controller('stores/products')
@UseGuards(SessionAuthGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}
  // ── Product Types (static routes — must come before :id) ──────────────────
  @Get('product-types')
  async getProductTypes(@Request() req) {
    return this.productService.getProductTypes(req.user.id)
  }
  @Post('product-types')
  async createProductType(
    @Request() req,
    @Body() body: { name: string },
  ) {
    console.log('👤 req.user:', req.user)  // ← 
    return this.productService.createProductType(req.user.id, body.name)
  }
  @Put('product-types/:id')
  async updateProductType(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { name: string },
  ) {
    return this.productService.updateProductType(req.user.id, id, body.name)
  }
  @Delete('product-types/:id')
  async deleteProductType(
    @Request() req,
    @Param('id') id: string,
  ) {
    return this.productService.deleteProductType(req.user.id, id)
  }
  // ── Tags (static routes — must come before :id) ───────────────────────────
  @Get('tags')
  async getTags(@Request() req) {
    return this.productService.getTags(req.user.id)
  }
  @Post('tags')
  async createTag(
    @Request() req,
    @Body() body: { name: string },
  ) {
    return this.productService.createTag(req.user.id, body.name)
  }
  @Put('tags/:id')
  async updateTag(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { name: string },
  ) {
    return this.productService.updateTag(req.user.id, id, body.name)
  }
  @Delete('tags/:id')
  async deleteTag(
    @Request() req,
    @Param('id') id: string,
  ) {
    return this.productService.deleteTag(req.user.id, id)
  }
  // ── Products (dynamic :id routes — must come after static routes) ─────────
  @Get()
  async getProducts(
    @Request() req,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.productService.getProducts(req.user.id, {
      status,
      search,
      page: parseInt(page),
      limit: parseInt(limit),
    })
  }
  @Get(':id')
  async getProduct(@Request() req, @Param('id') id: string) {
    return this.productService.getProduct(req.user.id, id)
  }
@Post()
async createProduct(@Request() req, @Body() body: any) {
  console.log('👤 req.user:', req.user)
  return this.productService.createProduct(req.user.id, body)
}
  @Put(':id')
  async updateProduct(
    @Request() req,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.productService.updateProduct(req.user.id, id, body)
  }
  @Delete(':id')
  async deleteProduct(@Request() req, @Param('id') id: string) {
    return this.productService.deleteProduct(req.user.id, id)
  }
  @Put(':id/status')
  async updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { status: ProductStatus },
  ) {
    return this.productService.updateProductStatus(req.user.id, id, body.status)
  }
  // FIX (جديد): endpoint مطلوب لزرار "نسخ" (Duplicate) في منيو الثلاث نقط
  // بالفرونت. بيستدعي duplicateProduct اللي بترجع نسخة كاملة من المنتج.
  @Post(':id/duplicate')
  async duplicateProduct(@Request() req, @Param('id') id: string) {
    return this.productService.duplicateProduct(req.user.id, id)
  }
  @Post(':id/images')
  async addImages(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { images: { url: string; alt?: string }[] },
  ) {
    return this.productService.addProductImages(req.user.id, id, body.images)
  }
  @Delete(':id/images/:imageId')
  async deleteImage(
    @Request() req,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.productService.deleteProductImage(req.user.id, id, imageId)
  }

 
}