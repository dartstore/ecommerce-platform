import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common'

import { PrismaService } from '../prisma/prisma.service'

@Injectable()
export class StoreService {
  constructor(
    private prisma: PrismaService,
  ) {}

  // =====================
  // STORES
  // =====================

  private jsonSafe(data: any) {
    return JSON.parse(
      JSON.stringify(
        data,
        (_, value) =>
          typeof value === 'bigint'
            ? value.toString()
            : value,
      ),
    )
  }


  async getMyStores(userId: any) {
    return this.prisma.store.findMany({
      where: {
        ownerId: BigInt(userId),
      },
      include: {
        theme: true,
        sections: true,
      },
    })
  }

  async createStore(
    userId: any,
    data: any,
  ) {
    const now = new Date()
    const store = await this.prisma.store.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        currency: data.currency || 'SAR',
        status: 1,
        ownerId: BigInt(userId),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })

    // Create default theme for the store
    await this.prisma.storeTheme.create({
      data: {
        store_id: store.id,
        colors: {
          primary: '#2563eb',
          secondary: '#64748b',
          accent: '#f59e0b',
          background: '#ffffff',
          surface: '#f8fafc',
          textPrimary: '#0f172a',
          textSecondary: '#64748b',
          textMuted: '#94a3b8',
          border: '#e2e8f0',
          headerBg: '#ffffff',
          headerText: '#0f172a',
          footerBg: '#0f172a',
          footerText: '#ffffff',
        },
        typography: {
          headingFont: 'Inter',
          bodyFont: 'Inter',
          baseSize: '16px',
          scale: 1.25,
          h1Size: '2.5rem',
          h2Size: '2rem',
          h3Size: '1.5rem',
          lineHeight: 1.6,
          letterSpacing: 'normal',
        },
        header: {
          showSearch: true,
          showAccount: true,
          showCart: true,
          sticky: false,
          background: '#ffffff',
          textColor: '#0f172a',
          logoPosition: 'left',
          menuPosition: 'center',
        },
        footer: {
          showNewsletter: true,
          showSocialLinks: true,
          columns: 4,
          background: '#0f172a',
          textColor: '#ffffff',
        },
      },
    })

    return store
  }

  async updateStore(
    userId: any,
    slug: string,
    data: any,
  ) {
    const store =
      await this.prisma.store.findFirst({
        where: {
          slug,
          ownerId: BigInt(userId),
        },
      })

    if (!store)
      throw new NotFoundException(
        'Store not found',
      )

    return this.prisma.store.update({
      where: {
        id: store.id,
      },
      data: {
        name: data.name,
        description: data.description,
        currency: data.currency,
        status: Number(data.status),
        updatedAt: new Date(),
      },
    })
  }

  // =====================
  // PAGES
  // =====================

  async getStorePages(userId: any) {
    const store =
      await this.prisma.store.findFirst({
        where: {
          ownerId: BigInt(userId),
        },
      })

    if (!store) return []

    return this.prisma.storePage.findMany({
      where: {
        store_id: store.id,
      },
      orderBy: {
        sort_order: 'asc',
      },
    })
  }

  async createStorePage(
    userId: any,
    data: any,
  ) {
    const store =
      await this.prisma.store.findFirst({
        where: {
          ownerId: BigInt(userId),
        },
      })

    if (!store)
      throw new ConflictException(
        'Create store first',
      )

    const lastPage =
      await this.prisma.storePage.findFirst({
        where: {
          store_id: store.id,
        },
        orderBy: {
          sort_order: 'desc',
        },
      })

    return this.prisma.storePage.create({
      data: {
        store_id: store.id,
        title: data.title,
        slug: data.slug,
        type: data.type,
        content: data.content || null,
        sort_order: lastPage
          ? lastPage.sort_order + 1
          : 0,
      },
    })
  }

  async updateStorePage(
    userId: any,
    pageId: string,
    data: any,
  ) {
    const store =
      await this.prisma.store.findFirst({
        where: {
          ownerId: BigInt(userId),
        },
      })

    if (!store)
      throw new NotFoundException('Store not found')

    const page = await this.prisma.storePage.findFirst({
      where: {
        id: BigInt(pageId),
        store_id: store.id,
      },
    })

    if (!page)
      throw new NotFoundException('Page not found')

    return this.prisma.storePage.update({
      where: {
        id: BigInt(pageId),
      },
      data: {
        title: data.title,
        slug: data.slug,
        type: data.type,
        content: data.content,
        is_active: data.is_active,
        image_url: data.image_url,
      },
    })
  }

  async deleteStorePage(
    userId: any,
    pageId: string,
  ) {
    const store =
      await this.prisma.store.findFirst({
        where: {
          ownerId: BigInt(userId),
        },
      })

    if (!store)
      throw new NotFoundException('Store not found')

    const page = await this.prisma.storePage.findFirst({
      where: {
        id: BigInt(pageId),
        store_id: store.id,
      },
    })

    if (!page)
      throw new NotFoundException('Page not found')

    return this.prisma.storePage.delete({
      where: {
        id: BigInt(pageId),
      },
    })
  }

  async reorderPages(
    pages: any[],
  ) {
    return Promise.all(
      pages.map(page =>
        this.prisma.storePage.update({
          where: {
            id: BigInt(page.id),
          },
          data: {
            sort_order:
              page.sort_order,
          },
        }),
      ),
    )
  }

  // =====================
  // MENUS
  // =====================

  async getMenus(userId: any) {
    const store =
      await this.prisma.store.findFirst({
        where: {
          ownerId: BigInt(userId),
        },
      })

    if (!store) return []

    return this.prisma.storeMenu.findMany({
      where: {
        store_id: store.id,
      },
      include: {
        items: {
          orderBy: {
            sort_order: 'asc',
          },
        },
      },
    })
  }

  async createMenu(
    userId: any,
    name: string,
  ) {
    const store =
      await this.prisma.store.findFirst({
        where: {
          ownerId: BigInt(userId),
        },
      })

    if (!store)
      throw new NotFoundException(
        'Store not found',
      )

    const baseHandle =
      name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')

    const handle =
      `${baseHandle}-${Date.now()}`

    return this.prisma.storeMenu.create({
      data: {
        name,
        handle,
        store_id: store.id,
      },
    })
  }

  async updateMenu(
    id: string,
    data: any,
  ) {
    return this.prisma.storeMenu.update({
      where: {
        id: BigInt(id),
      },
      data: {
        name: data.name,
      },
    })
  }

  async deleteMenu(
    id: string,
    userId: string,
  ) {
    const store =
      await this.prisma.store.findFirst({
        where: {
          ownerId: BigInt(userId),
        },
      })

    if (!store)
      throw new NotFoundException('Store not found')

    const menu = await this.prisma.storeMenu.findFirst({
      where: {
        id: BigInt(id),
        store_id: store.id,
      },
    })

    if (!menu)
      throw new NotFoundException('Menu not found')

    return this.prisma.storeMenu.delete({
      where: {
        id: BigInt(id),
      },
    })
  }

  async addMenuItem(
    menuId: string,
    data: any,
  ) {
    const lastItem =
      await this.prisma.menuItem.findFirst({
        where: {
          menu_id: BigInt(menuId),
        },
        orderBy: {
          sort_order: 'desc',
        },
      })

    return this.prisma.menuItem.create({
      data: {
        menu_id: BigInt(menuId),
        title: data.title,
        type: data.type,
        url: data.url,
        resource_id:
          data.resource_id || null,
        parent_id:
          data.parent_id || null,
        sort_order:
          lastItem
            ? lastItem.sort_order + 1
            : 0,
      },
    })
  }

  async updateMenuItem(
    itemId: string,
    data: any,
  ) {
    return this.prisma.menuItem.update({
      where: {
        id: BigInt(itemId),
      },
      data: {
        title: data.title,
        url: data.url,
        type: data.type,
        resource_id: data.resource_id || null,
        parent_id: data.parent_id || null,
      },
    })
  }

  async deleteMenuItem(
    itemId: string,
  ) {
    return this.prisma.menuItem.delete({
      where: {
        id: BigInt(itemId),
      },
    })
  }

  async reorderMenuItems(items: any[]) {
  return Promise.all(
    items.map((item) =>
      this.prisma.menuItem.update({
        where: {
          id: BigInt(item.id),
        },
        data: {
          sort_order: item.sortOrder,
          // لو الفرونت بعت parentId، حدّثه؛ لو مبعتوش خالص، سيب القديم زي ما هو
          ...(item.parentId !== undefined
            ? { parent_id: item.parentId ? BigInt(item.parentId) : null }
            : {}),
        },
      }),
    ),
  )
}

  // =====================
  // LINK PICKER
  // =====================

  async getLinkPicker(userId: any) {
    const store =
      await this.prisma.store.findFirst({
        where: {
          ownerId: BigInt(userId),
        },
      })

    if (!store) {
      return {
        pages: [],
        collections: [],
        products: [],
        blogs: [],
        blogPosts: [],
        policies: [],
        canCreateCollection: true,
        canCreateProduct: true,
        canCreateBlog: true,
        canCreatePost: true,
      }
    }

    const pages =
      await this.prisma.storePage.findMany({
        where: {
          store_id: store.id,
        },
        orderBy: {
          title: 'asc',
        },
      })

    const policies = [
      {
        title: 'Privacy Policy',
        url: '/policies/privacy',
      },
      {
        title: 'Refund Policy',
        url: '/policies/refund',
      },
      {
        title: 'Terms of Service',
        url: '/policies/terms',
      },
    ]

    return {
      pages,
      policies,
      collections: [],
      products: [],
      blogs: [],
      blogPosts: [],
      canCreateCollection: true,
      canCreateProduct: true,
      canCreateBlog: true,
      canCreatePost: true,
    }
  }

  async getMenu(
    menuId: string,
    userId: string,
  ) {
    const store =
      await this.prisma.store.findFirst({
        where: {
          ownerId: BigInt(userId)
        }
      })

    if (!store)
      throw new NotFoundException()

    return this.prisma.storeMenu.findFirst({
      where: {
        id: BigInt(menuId),
        store_id: store.id
      },
      include: {
        items: {
          orderBy: {
            sort_order: 'asc'
          }
        }
      }
    })
  }

  async duplicateMenu(
  menuId: string
  ) {
    const menu =
      await this.prisma.storeMenu.findUnique({
        where: {
          id: BigInt(menuId)
        },
        include: {
          items: { orderBy: { sort_order: 'asc' } }
        }
      })

    const newMenu =
      await this.prisma.storeMenu.create({
        data: {
          store_id: menu!.store_id,
          name: menu!.name + ' copy',
          handle:
            `${menu!.handle}-copy-${Date.now()}`
        }
      })

    // بننسخ الـ root items الأول، وبعدين الأبناء — عشان نقدر نربط
    // parent_id الجديد بالـ id الجديد الصح (مش القديم)
    // ملحوظة: النسخة دي بتدعم مستوى واحد من التداخل (أب + أبناء)،
    // لو محتاج مستويات أعمق قولّي أزودها.
    const idMap = new Map<string, bigint>()
    const roots = menu!.items.filter((i) => !i.parent_id)
    const children = menu!.items.filter((i) => i.parent_id)

    for (const item of roots) {
      const created = await this.prisma.menuItem.create({
        data: {
          menu_id: newMenu.id,
          title: item.title,
          type: item.type,
          url: item.url,
          resource_id: item.resource_id,
          sort_order: item.sort_order,
        },
      })
      idMap.set(item.id.toString(), created.id)
    }

    for (const item of children) {
      const newParentId = idMap.get(item.parent_id!.toString())
      const created = await this.prisma.menuItem.create({
        data: {
          menu_id: newMenu.id,
          title: item.title,
          type: item.type,
          url: item.url,
          resource_id: item.resource_id,
          parent_id: newParentId || null,
          sort_order: item.sort_order,
        },
      })
      idMap.set(item.id.toString(), created.id)
    }

    return newMenu
  }

  // =====================
  // THEME SYSTEM
  // =====================

  async getTheme(userId: string) {
    const store =
      await this.prisma.store.findFirst({
        where: {
          ownerId: BigInt(userId)
        }
      })

    if (!store) {
      return null
    }

    let theme =
      await this.prisma.storeTheme.findUnique({
        where: {
          store_id: store.id
        }
      })

    if (!theme) {
      theme = await this.prisma.storeTheme.create({
        data: {
          store_id: store.id,
          colors: {
            primary: '#2563eb',
            secondary: '#64748b',
            accent: '#f59e0b',
            background: '#ffffff',
            surface: '#f8fafc',
            textPrimary: '#0f172a',
            textSecondary: '#64748b',
            textMuted: '#94a3b8',
            border: '#e2e8f0',
            headerBg: '#ffffff',
            headerText: '#0f172a',
            footerBg: '#0f172a',
            footerText: '#ffffff',
          },
          typography: {
            headingFont: 'Inter',
            bodyFont: 'Inter',
            baseSize: '16px',
            scale: 1.25,
            h1Size: '2.5rem',
            h2Size: '2rem',
            h3Size: '1.5rem',
            lineHeight: 1.6,
            letterSpacing: 'normal',
          },
          header: {
            showSearch: true,
            showAccount: true,
            showCart: true,
            sticky: false,
            background: '#ffffff',
            textColor: '#0f172a',
            logoPosition: 'left',
            menuPosition: 'center',
          },
          footer: {
            showNewsletter: true,
            showSocialLinks: true,
            columns: 4,
            background: '#0f172a',
            textColor: '#ffffff',
          },
        }
      })
    }

    // Fetch sections separately
    const sections = await this.prisma.themeSection.findMany({
      where: { store_id: store.id },
      orderBy: { sort_order: 'asc' }
    })

    return { ...theme, sections }
  }

 async updateTheme(userId: string, content: any) {
  const store = await this.prisma.store.findFirst({
    where: { ownerId: BigInt(userId) }
  })



  if (!store) throw new Error('Store not found')

  const data: any = {
    updated_at: new Date(),
  }

  if (content.colors) data.colors = content.colors
  if (content.typography) data.typography = content.typography
  if (content.header) data.header = content.header
  if (content.footer) data.footer = content.footer
  if (content.settings) data.settings = content.settings
    data.menu_id =
  content.menu_id
    ? BigInt(content.menu_id)
    : null
  return this.prisma.storeTheme.upsert({
    where: { store_id: store.id },
    create: {
      store_id: store.id,
       menu_id: content.menu_id
    ? BigInt(content.menu_id)
    : null,
      colors: content.colors || {},
      typography: content.typography || {},
      header: content.header || {},
      footer: content.footer || {},
      settings: content.settings || null,
    },
    update: data,
  })
}

private async createPublishedTheme(
  storeId: bigint,
) {
  const themeRaw =
    await this.prisma.storeTheme.findUnique({
      where: {
        store_id: storeId,
      },
    })

  const sectionsRaw =
    await this.prisma.themeSection.findMany({
      where: {
        store_id: storeId,
        is_active: true,
      },
      orderBy: {
        sort_order: 'asc',
      },
    })

  const menusRaw =
    await this.prisma.storeMenu.findMany({
      where: {
        store_id: storeId,
      },
      include: {
        items: {
          orderBy: {
            sort_order: 'asc',
          },
        },
      },
    })

  const theme = this.jsonSafe(themeRaw)
  const sections = this.jsonSafe(sectionsRaw)
  const menus = this.jsonSafe(menusRaw)
console.log(
  'PUBLISH MENUS =>',
  JSON.stringify(menus, null, 2)
)
  await this.prisma.storeThemePublished.upsert({
    where: {
      store_id: storeId,
    },

    create: {
      store_id: storeId,
      theme,
      sections,
      menus,
    },

    update: {
      theme,
      sections,
      menus,
    },
  })
}

async publishTheme(userId: string) {
  const store =
    await this.prisma.store.findFirst({
      where: {
        ownerId: BigInt(userId),
      },
    })

  if (!store)
    throw new NotFoundException()

  await this.createPublishedTheme(
    store.id,
  )

  return {
    success: true,
  }
}
  async updateThemeColors(
    userId: string,
    colors: any,
  ) {
    const store = await this.prisma.store.findFirst({
      where: { ownerId: BigInt(userId) }
    })
    if (!store) throw new NotFoundException('Store not found')

    return this.prisma.storeTheme.update({
      where: { store_id: store.id },
      data: { colors }
    })
  }

  async updateThemeTypography(
    userId: string,
    typography: any,
  ) {
    const store = await this.prisma.store.findFirst({
      where: { ownerId: BigInt(userId) }
    })
    if (!store) throw new NotFoundException('Store not found')

    return this.prisma.storeTheme.update({
      where: { store_id: store.id },
      data: { typography }
    })
  }

  async updateThemeHeader(
    userId: string,
    header: any,
  ) {
    const store = await this.prisma.store.findFirst({
      where: { ownerId: BigInt(userId) }
    })
    if (!store) throw new NotFoundException('Store not found')

    return this.prisma.storeTheme.update({
      where: { store_id: store.id },
      data: { header }
    })
  }

  async updateThemeFooter(
    userId: string,
    footer: any,
  ) {
    const store = await this.prisma.store.findFirst({
      where: { ownerId: BigInt(userId) }
    })
    if (!store) throw new NotFoundException('Store not found')

    return this.prisma.storeTheme.update({
      where: { store_id: store.id },
      data: { footer }
    })
  }

  // =====================
  // THEME SECTIONS
  // =====================

  async getThemeSections(userId: string, pageType: string = 'home') {
    const store = await this.prisma.store.findFirst({
      where: { ownerId: BigInt(userId) }
    })
    if (!store) return []

    return this.prisma.themeSection.findMany({
      where: {
        store_id: store.id,
        page_type: pageType,
      },
      orderBy: { sort_order: 'asc' }
    })
  }

  async addThemeSection(
    userId: string,
    data: any,
  ) {
    const store = await this.prisma.store.findFirst({
      where: { ownerId: BigInt(userId) }
    })
    if (!store) throw new NotFoundException('Store not found')

    const lastSection = await this.prisma.themeSection.findFirst({
      where: { store_id: store.id, page_type: data.pageType || 'home' },
      orderBy: { sort_order: 'desc' }
    })

    return this.prisma.themeSection.create({
      data: {
        store_id: store.id,
        type: data.type,
        name: data.name,
        settings: data.settings || {},
        blocks: data.blocks || [],
        sort_order: lastSection ? lastSection.sort_order + 1 : 0,
        page_type: data.pageType || 'home',
        is_active: true,
      }
    })
  }

  async updateThemeSection(
    userId: string,
    sectionId: string,
    data: any,
  ) {
    const store = await this.prisma.store.findFirst({
      where: { ownerId: BigInt(userId) }
    })
    if (!store) throw new NotFoundException('Store not found')

    const section = await this.prisma.themeSection.findFirst({
      where: { id: BigInt(sectionId), store_id: store.id }
    })
    if (!section) throw new NotFoundException('Section not found')

    return this.prisma.themeSection.update({
      where: { id: BigInt(sectionId) },
      data: {
        name: data.name,
        settings: data.settings,
        blocks: data.blocks,
        sort_order: data.sortOrder,
        is_active: data.isActive,
      }
    })
  }

async deleteThemeSection(
  userId: string,
  sectionId: string,
) {
  const store =
    await this.prisma.store.findFirst({
      where: {
        ownerId: BigInt(userId),
      },
    })

  if (!store)
    throw new NotFoundException()

  const section =
    await this.prisma.themeSection.findFirst({
      where: {
        id: BigInt(sectionId),
        store_id: store.id,
      },
    })

  if (!section)
    throw new NotFoundException()

  return this.prisma.themeSection.delete({
    where: {
      id: BigInt(sectionId),
    },
  })
}
  async reorderThemeSections(
    userId: string,
    sections: { id: string; sortOrder: number }[],
  ) {
    const store = await this.prisma.store.findFirst({
      where: { ownerId: BigInt(userId) }
    })
    if (!store) throw new NotFoundException('Store not found')

    return Promise.all(
      sections.map(section =>
        this.prisma.themeSection.update({
          where: { id: BigInt(section.id) },
          data: { sort_order: section.sortOrder }
        })
      )
    )
  }

  // =====================
  // PUBLIC STORE
  // =====================

  async getPublicStore(slug: string) {
  const store =
    await this.prisma.store.findUnique({
      where: {
        slug,
      },
    })

  if (!store)
    return null

  const published =
    await this.prisma.storeThemePublished.findUnique({
      where: {
        store_id: store.id,
      },
    })

  return {
    ...store,

    theme:
      published?.theme || null,

    sections:
      published?.sections || [],

    menus:
      published?.menus || [],
  }
}

  // stores.zip/store.service.ts - أضف/تأكد من وجود الدول دي

async getPublicStoreTheme(slug: string) {
  const store = await this.prisma.store.findUnique({
    where: { slug }
  })
  if (!store) return null

  const published =
  await this.prisma.storeThemePublished.findUnique({
    where: {
      store_id: store.id,
    },
  })

return published?.theme || null
}

async getPublicStoreSections(slug: string, pageType: string = 'home') {
  const store = await this.prisma.store.findUnique({
    where: { slug }
  })
  if (!store) return null

  return this.prisma.themeSection.findMany({
    where: {
      store_id: store.id,
      page_type: pageType,
      is_active: true,
    },
    orderBy: { sort_order: 'asc' }
  })
}

  async getPublicStorePage(
    slug: string,
    pageSlug: string,
  ) {
    const store = await this.prisma.store.findUnique({
      where: { slug }
    })
    if (!store) return null

    return this.prisma.storePage.findFirst({
      where: {
        store_id: store.id,
        slug: pageSlug,
      },
    })
  }

  async getPublicStoreMenu(
    slug: string,
    handle: string,
  ) {
    const store = await this.prisma.store.findUnique({
      where: { slug }
    })
    if (!store) return null

    return this.prisma.storeMenu.findFirst({
      where: {
        store_id: store.id,
        handle,
      },
      include: {
        items: {
          orderBy: {
            sort_order: 'asc',
          },
        },
      },
    })
  }

  async getThemePreview(
  userId: string,
) {
  const store =
    await this.prisma.store.findFirst({
      where: {
        ownerId: BigInt(userId),
      },
    })

  if (!store)
    throw new NotFoundException()

  const theme =
    await this.prisma.storeTheme.findUnique({
      where: {
        store_id: store.id,
      },
    })

  const sections =
    await this.prisma.themeSection.findMany({
      where: {
        store_id: store.id,
      },
      orderBy: {
        sort_order: 'asc',
      },
    })

  const menus =
    await this.prisma.storeMenu.findMany({
      where: {
        store_id: store.id,
      },
      include: {
        items: {
          orderBy: {
            sort_order: 'asc',
          },
        },
      },
    })

  return {
    store,
    theme,
    sections,
    menus,
  }
}
// async getPublicStoreProducts(slug: string, limit: number = 8) {
//   const store = await this.prisma.store.findUnique({ where: { slug } })
//   if (!store) return []
  
//   return this.prisma.product.findMany({
//     where: { store_id: store.id, status: 'active' },
//     take: limit,
//     orderBy: { created_at: 'desc' },
//   })
// }

}