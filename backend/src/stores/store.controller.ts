import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  NotFoundException,
} from '@nestjs/common'

import { StoreService } from './store.service'
import { SessionAuthGuard } from '../auth/session-auth.guard'


@Controller('stores')
@UseGuards(SessionAuthGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  private getUserId(req: any): string {
    return req.user?.id?.toString() || req.user?.sub?.toString()
  }

  // =====================
  // STORES
  // =====================

  @Get()
  async getStores(@Request() req) {
    return this.storeService.getMyStores(req.user.id)
  }

  @Post()
  async create(@Request() req, @Body() body: any) {
    return this.storeService.createStore(req.user.id, body)
  }

  

  // =====================
  // PAGES
  // =====================

  @Get('pages')
  async getPages(@Request() req) {
    return this.storeService.getStorePages(req.user.id)
  }

  @Post('pages')
  async createPage(@Request() req, @Body() body: any) {
    return this.storeService.createStorePage(req.user.id, body)
  }

  @Post('pages/reorder')
  async reorderPages(@Body() body: any) {
    return this.storeService.reorderPages(body.pages)
  }

  // =====================
  // MENUS
  // =====================

  @Get('menus')
  async getMenus(@Request() req) {
    return this.storeService.getMenus(req.user.id)
  }

  @Post('menus')
  async createMenu(@Request() req, @Body() body: any) {
    return this.storeService.createMenu(req.user.id, body.name)
  }

  @Put('menus/:id')
  async updateMenu(@Param('id') id: string, @Body() body: any) {
    return this.storeService.updateMenu(id, body)
  }

  @Delete('menus/:id')
  async deleteMenu(@Param('id') id: string, @Request() req) {
    return this.storeService.deleteMenu(id, req.user.id)
  }

  @Post('menus/:id/items')
  async addMenuItem(@Param('id') id: string, @Body() body: any) {
    return this.storeService.addMenuItem(id, body)
  }

  @Put('menus/items/:id')
  async updateMenuItem(@Param('id') id: string, @Body() body: any) {
    return this.storeService.updateMenuItem(id, body)
  }

  @Delete('menus/items/:id')
  async deleteMenuItem(@Param('id') id: string) {
    return this.storeService.deleteMenuItem(id)
  }

  @Post('menus/reorder')
  async reorderMenu(@Body() body: any) {
    return this.storeService.reorderMenuItems(body.items)
  }

  @Get('menus/:id')
  async getMenu(@Param('id') id: string, @Request() req) {
    return this.storeService.getMenu(id, req.user.id)
  }

  @Post('menus/:id/duplicate')
  async duplicateMenu(@Param('id') id: string) {
    return this.storeService.duplicateMenu(id)
  }

  // =====================
  // LINK PICKER
  // =====================

  @Get('link-picker')
  async getLinkPicker(@Request() req) {
    return this.storeService.getLinkPicker(req.user.id)
  }

  // =====================
  // THEME
  // =====================

  

  @Get('theme')
  async getTheme(@Request() req) {
    return this.storeService.getTheme(this.getUserId(req))
  }

@Put('theme')
async updateTheme(@Request() req, @Body() body: any) {
  console.log('=== CONTROLLER DEBUG ===')
  console.log('req.user:', req.user)
  console.log('body:', body)
  return this.storeService.updateTheme(req.user?.id?.toString(), body)
}

@Post('theme/publish')
async publishTheme(
  @Request() req,
) {
  return this.storeService.publishTheme(
    req.user.id.toString(),
  )
}
@Get('theme/preview')
async getThemePreview(
  @Request() req,
) {
  return this.storeService.getThemePreview(
    req.user.id.toString(),
  )
}
  @Put('theme/colors')
  async updateThemeColors(@Request() req, @Body() body: any) {
    return this.storeService.updateThemeColors(req.user.id, body)
  }

  @Put('theme/typography')
  async updateThemeTypography(@Request() req, @Body() body: any) {
    return this.storeService.updateThemeTypography(req.user.id, body)
  }

  @Put('theme/header')
  async updateThemeHeader(@Request() req, @Body() body: any) {
    return this.storeService.updateThemeHeader(req.user.id, body)
  }

  @Put('theme/footer')
  async updateThemeFooter(@Request() req, @Body() body: any) {
    return this.storeService.updateThemeFooter(req.user.id, body)
  }

  // =====================
  // THEME SECTIONS
  // =====================

  @Get('theme/sections')
  async getThemeSections(@Request() req, @Query('pageType') pageType: string = 'home') {
    return this.storeService.getThemeSections(req.user.id, pageType)
  }

  @Post('theme/sections')
  async addThemeSection(@Request() req, @Body() body: any) {
    return this.storeService.addThemeSection(req.user.id, body)
  }

  @Put('theme/sections/reorder')
async reorderThemeSections(@Request() req, @Body() body: any) {
  console.log('=== REORDER DEBUG ===')
  console.log('body:', body)
  console.log('body.sections:', body?.sections)
  console.log('req.user?.id:', req.user?.id)
  return this.storeService.reorderThemeSections(req.user?.id?.toString(), body.sections)
}

  @Put('theme/sections/:id')
  async updateThemeSection(@Param('id') id: string, @Request() req, @Body() body: any) {
    return this.storeService.updateThemeSection(req.user.id, id, body)
  } 

  @Delete('theme/sections/:id')
  async deleteThemeSection(@Param('id') id: string, @Request() req) {
    return this.storeService.deleteThemeSection(req.user.id, id)
  }

//   @Get(':slug/products')
// async getPublicProducts(
//   @Param('slug') slug: string,
//   @Query('limit') limit: string = '8',
// ) {
//   return this.storeService.getPublicStoreProducts(slug, parseInt(limit))
// }

  @Post(':slug')
async update(@Request() req, @Param('slug') slug: string, @Body() body: any) {
  if (slug === 'products') {
    throw new NotFoundException('Store not found')
  }
  return this.storeService.updateStore(req.user.id, slug, body)
}
}