import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, CurrentUser } from '../../../common/decorators/auth.decorators';
import {
  CreateAddressDto,
  UpdateAddressDto,
} from '../application/dto/address.dto';
import { CreateAddressUseCase } from '../application/use-cases/create-address.use-case';
import { DeleteAddressUseCase } from '../application/use-cases/delete-address.use-case';
import { ListAddressesUseCase } from '../application/use-cases/list-addresses.use-case';
import { SetDefaultAddressUseCase } from '../application/use-cases/set-default-address.use-case';
import { UpdateAddressUseCase } from '../application/use-cases/update-address.use-case';

/**
 * The address book. Every route is authenticated and every one takes its owner
 * from the verified token rather than the path — there is deliberately no
 * `/users/:userId/addresses` shape here, because the moment a user id is a
 * parameter, somebody will forget to check it against the caller.
 */
@ApiTags('Addresses')
@ApiBearerAuth()
@Controller('addresses')
export class AddressController {
  constructor(
    private readonly listAddresses: ListAddressesUseCase,
    private readonly createAddress: CreateAddressUseCase,
    private readonly updateAddress: UpdateAddressUseCase,
    private readonly deleteAddress: DeleteAddressUseCase,
    private readonly setDefault: SetDefaultAddressUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'The saved address book, default first' })
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.listAddresses.execute(user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a new address (the first one becomes the default)' })
  @ApiResponse({ status: 409, description: 'The saved-address limit has been reached' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateAddressDto) {
    const { isDefault, ...address } = dto;
    return this.createAddress.execute({ userId: user.sub, isDefault, ...address });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Replace an address in full' })
  @ApiResponse({ status: 404, description: 'No such address for this user' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const { isDefault, ...address } = dto;
    return this.updateAddress.execute({ userId: user.sub, addressId: id, isDefault, ...address });
  }

  @Patch(':id/default')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Make this the default delivery address' })
  async makeDefault(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.setDefault.execute({ userId: user.sub, addressId: id });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an address (another is promoted if this was the default)' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.deleteAddress.execute({ userId: user.sub, addressId: id });
  }
}
