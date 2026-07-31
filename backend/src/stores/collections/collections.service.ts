import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

function toHandle(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/g, '')
    .replace(/[^a-z0-9\s-]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class CollectionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * بيحل storeId بتاع المستخدم الحالي من الـ userId — بالظبط نفس المنطق
   * اللي المفروض موجود جوه ProductService (كل method هناك بتاخد
   * req.user.id مش storeId مباشرة). لو اسم عمود الملكية في جدول stores
   * عندك مختلف عن userId (مثلاً ownerId)، غيّره هنا بس.
   */
  private async getStoreIdForUser(userId: string): Promise<bigint> {
  const store = await this.prisma.store.findFirst({
    where: { ownerId: BigInt(userId) },   // ← ده الصح حسب الـ schema
    select: { id: true },
  });
  if (!store) throw new NotFoundException('لا يوجد متجر مرتبط بهذا المستخدم');
  return store.id;
}

  /** بتاعة الاستخدام السريع جوه ProductForm — get-or-create بالاسم،
   *  بالظبط زي endpoint الـ tags و product-types الحاليين عندك. */
  async getOrCreateByName(userId: string, name: string) {
    const storeId = await this.getStoreIdForUser(userId);
    // مفيش أي "اسم تلقائي" وهمي (زي collection-1784...) — لو الاسم مش
    // قابل للتحويل لحروف/أرقام إنجليزية (زي اسم عربي بالكامل)، الـ handle
    // بياخد الاسم نفسه زي ما هو، بالظبط زي الفرونت (Title → handle).
    const handle = toHandle(name) || name;
    const existing = await this.prisma.collection.findFirst({
      where: { storeId, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) return existing;

    return this.prisma.collection.create({
      data: { storeId, name, handle },
    });
  }

  async list(userId: string) {
    const storeId = await this.getStoreIdForUser(userId);
    const collections = await this.prisma.collection.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { products: true } } },
    });
    return collections.map((c) => ({
      id: c.id,
      name: c.name,
      handle: c.handle,
      description: c.description,
      image_url: c.image_url,
      product_count: c._count.products,
      // الفرونت محتاجهم لعمود "Updated" — كانوا مش راجعين خالص قبل كده
      created_at: c.createdAt,
      updated_at: c.updatedAt,
    }));
  }

  async getOne(userId: string, id: number) {
    const storeId = await this.getStoreIdForUser(userId);
    const collection = await this.prisma.collection.findFirst({
      where: { id, storeId },
      include: {
        products: {
          orderBy: { position: 'asc' },
          include: {
            product: {
              include: { images: { take: 1, orderBy: { position: 'asc' } } },
            },
          },
        },
      },
    });
    if (!collection) throw new NotFoundException('Collection not found');
    return {
      id: collection.id,
      name: collection.name,
      handle: collection.handle,
      description: collection.description,
      image_url: collection.image_url,
      image_key: collection.image_key,
      created_at: collection.createdAt,
      updated_at: collection.updatedAt,
      products: collection.products.map((pc) => ({
        id: pc.product.id,
        title: pc.product.title,
        image_url: pc.product.images[0]?.url || null,
      })),
    };
  }

  async create(
    userId: string,
    dto: {
      name: string;
      description?: string | null;
      image_url?: string | null;
      image_key?: string | null;
      seo_title?: string | null;
      seo_description?: string | null;
      product_ids?: string[];
    },
  ) {
    const storeId = await this.getStoreIdForUser(userId);
    // نفس المبدأ هنا: من غير أي fallback وهمي بـ timestamp. لو الاسم منه
    // حروف/أرقام إنجليزية قابلة للتحويل، بياخدها؛ لو مش قابل (عربي بالكامل
    // مثلاً)، الـ base بيبقى الاسم نفسه زي ما هو، وبعدين لو فيه تكرار
    // بنضيفله رقم تسلسلي عادي (-2, -3, ...) بس عشان يفضل unique.
    const baseHandle = toHandle(dto.name) || dto.name;

    let handle = baseHandle;
    let i = 1;
    while (
      await this.prisma.collection.findFirst({ where: { storeId, handle } })
    ) {
      handle = `${baseHandle}-${++i}`;
    }

    const collection = await this.prisma.collection.create({
      data: {
        storeId,
        name: dto.name,
        handle,
        description: dto.description ?? null,
        image_url: dto.image_url ?? null,
        image_key: dto.image_key ?? null,
        seo_title: dto.seo_title ?? null,
        seo_description: dto.seo_description ?? null,
      },
    });

    if (dto.product_ids?.length) {
      await this.prisma.productCollection.createMany({
        data: dto.product_ids.map((id, position) => ({
          collectionId: collection.id,
          productId: BigInt(id),
          position,
        })),
        skipDuplicates: true,
      });
    }

    return this.getOne(userId, collection.id);
  }

  async update(
    userId: string,
    id: number,
    dto: {
      name?: string;
      description?: string | null;
      image_url?: string | null;
      image_key?: string | null;
      seo_title?: string | null;
      seo_description?: string | null;
      product_ids?: string[];
    },
  ) {
    const storeId = await this.getStoreIdForUser(userId);
    const existing = await this.prisma.collection.findFirst({ where: { id, storeId } });
    if (!existing) throw new NotFoundException('Collection not found');

    return this.prisma.$transaction(async (tx) => {
      if (dto.product_ids) {
        await tx.productCollection.deleteMany({ where: { collectionId: id } });
        if (dto.product_ids.length) {
          await tx.productCollection.createMany({
            data: dto.product_ids.map((productId, position) => ({
              collectionId: id,
              productId: BigInt(productId),
              position,
            })),
          });
        }
      }

      await tx.collection.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description !== undefined ? dto.description : undefined,
          image_url: dto.image_url !== undefined ? dto.image_url : undefined,
          image_key: dto.image_key !== undefined ? dto.image_key : undefined,
          seo_title:
            dto.seo_title !== undefined ? dto.seo_title : undefined,

          seo_description:
            dto.seo_description !== undefined ? dto.seo_description : undefined,

          // Prisma بيحدّث updatedAt تلقائي مع @updatedAt، بس لازم الـ
          // update فعلًا يتنفذ حتى لو مفيش حقول اتغيرت — ده بيحصل هنا
          // أصلًا لأننا دايمًا بنعمل tx.collection.update.
        },
      });

      return this.getOne(userId, id);
    });
  }

  async remove(userId: string, id: number) {
    const storeId = await this.getStoreIdForUser(userId);
    const existing = await this.prisma.collection.findFirst({ where: { id, storeId } });
    if (!existing) throw new NotFoundException('Collection not found');
    return this.prisma.collection.delete({ where: { id } });
  }

  async addProducts(userId: string, id: number, productIds: string[]) {
    const storeId = await this.getStoreIdForUser(userId);
    const existing = await this.prisma.collection.findFirst({ where: { id, storeId } });
    if (!existing) throw new NotFoundException('Collection not found');

    const lastPosition = await this.prisma.productCollection.count({
      where: { collectionId: id },
    });

    await this.prisma.productCollection.createMany({
      data: productIds.map((productId, index) => ({
        collectionId: id,
        productId: BigInt(productId),
        position: lastPosition + index,
      })),
      skipDuplicates: true,
    });

    return this.getOne(userId, id);
  }

  async removeProduct(userId: string, id: number, productId: string) {
    const storeId = await this.getStoreIdForUser(userId);
    const existing = await this.prisma.collection.findFirst({ where: { id, storeId } });
    if (!existing) throw new NotFoundException('Collection not found');

    await this.prisma.productCollection.deleteMany({
      where: { collectionId: id, productId: BigInt(productId) },
    });

    return this.getOne(userId, id);
  }
}