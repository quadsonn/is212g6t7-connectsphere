import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Validates that this date property is strictly later than another property on
 * the same object.
 *
 * Written as a property decorator rather than a service-level check so the
 * failure is attached to the offending field — AC-3 requires each bad field to
 * be flagged individually, and a cross-field error raised in the service would
 * arrive as one unattributed message.
 */
export function IsAfterField(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAfterField',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          const related = (args.object as Record<string, unknown>)[
            relatedPropertyName
          ];

          const end = new Date(value as string);
          const start = new Date(related as string);

          // A malformed counterpart is that field's problem to report, not
          // ours — stay silent rather than emit a second confusing message.
          if (Number.isNaN(end.getTime()) || Number.isNaN(start.getTime())) {
            return true;
          }

          return end.getTime() > start.getTime();
        },
        defaultMessage(args: ValidationArguments) {
          const [relatedPropertyName] = args.constraints as [string];
          return `${args.property} must be later than ${relatedPropertyName}`;
        },
      },
    });
  };
}
