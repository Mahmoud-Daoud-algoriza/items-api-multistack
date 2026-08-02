import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsNumber,
  IsPositive,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

const SKU_PATTERN = /^[A-Z0-9-]{3,20}$/;

/** Largest value representable by the contract's DECIMAL(10,2). */
const MAX_PRICE = 99_999_999.99;

/**
 * The request body of `POST /items`, and the only place the write rules live.
 *
 * `ValidationPipe` is configured with `whitelist: true`, so any property not declared here
 * is stripped from the payload before it reaches the controller — which is how the contract's
 * "unknown fields are ignored" rule is enforced, and why a client-supplied `id` cannot
 * override the server-assigned one.
 */
export class CreateItemDto {
  @IsDefined({ message: 'This field is required.' })
  @IsString({ message: 'Must be a string.' })
  @Transform(({ value }): unknown => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 100, { message: 'Must be between 2 and 100 characters.' })
  name!: string;

  @IsDefined({ message: 'This field is required.' })
  @IsString({ message: 'Must be a string.' })
  @Matches(SKU_PATTERN, {
    message: 'Must be 3 to 20 characters using only A-Z, 0-9 and hyphens.',
  })
  sku!: string;

  @IsDefined({ message: 'This field is required.' })
  @IsInt({ message: 'Must be a whole number.' })
  @Min(0, { message: 'Must be greater than or equal to 0.' })
  quantity!: number;

  @IsDefined({ message: 'This field is required.' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Must have at most 2 decimal places.' })
  @IsPositive({ message: 'Must be greater than 0.' })
  @Max(MAX_PRICE, { message: `Must not exceed ${MAX_PRICE}.` })
  price!: number;
}
